import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { upsertConnectedAccount, type Platform } from "@/lib/social/repositories/accounts";
import { recordAudit } from "@/lib/social/repositories/system";
import { getCanonicalSocialRedirectUri } from "@/lib/social/oauth-origin";
import { recordOAuthDiagnostic } from "@/lib/social/oauth-diagnostics";

const PROVIDER_LABELS: Record<string, string> = {
  google_business: "Google",
  google: "Google",
  instagram: "Meta",
  facebook: "Meta",
  threads: "Meta",
  linkedin: "LinkedIn",
  youtube: "Google",
  x: "X",
};

/**
 * GET /api/social/oauth/:provider/callback
 *
 * Canonical OAuth callback for all social connectors (Admin + Onboarding).
 *
 * Validates the signed state token, exchanges code for token, and:
 * - Onboarding (redirectTo=/app): records verified connection proof in user metadata (pre-tenant)
 *   and redirects with explicit status: /app?oauth=success&provider=:provider&connected=:provider
 * - Admin (/admin/social): enforces requireAdmin(), upserts encrypted tokens to social_accounts table.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const origin = req.nextUrl.origin;

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const errorReason = req.nextUrl.searchParams.get("error_reason") || req.nextUrl.searchParams.get("error_description");

  recordOAuthDiagnostic({
    provider,
    stage: "callback_received",
    status: oauthError ? "failure" : "info",
    reason: oauthError || undefined,
    details: { hasCode: !!code, hasState: !!state, errorReason },
  });

  // Determine fallback fail destination from state if available
  let fallbackRedirect = "/admin/social";
  let isOnboarding = false;
  if (state) {
    const v = verifySignedState(state);
    if (v.valid && v.payload.redirectTo?.startsWith("/app")) {
      fallbackRedirect = "/app";
      isOnboarding = true;
    }
  }

  const failRedirect = (status: "error" | "denied" | "cancelled", reason: string) => {
    const target = new URL(fallbackRedirect, origin);
    target.searchParams.set("oauth", status);
    target.searchParams.set("provider", provider);
    target.searchParams.set("connect_error", reason);
    return NextResponse.redirect(target.toString());
  };

  if (oauthError) {
    const isDenied = oauthError === "access_denied" || errorReason?.includes("denied") || errorReason?.includes("cancelled");
    recordOAuthDiagnostic({
      provider,
      stage: "authorization",
      status: "failure",
      reason: oauthError,
      details: { isDenied, errorReason },
    });
    return failRedirect(isDenied ? "denied" : "error", oauthError);
  }

  if (!code || !state) {
    recordOAuthDiagnostic({
      provider,
      stage: "callback_received",
      status: "failure",
      reason: "missing_code_or_state",
    });
    return failRedirect("error", "missing_code_or_state");
  }

  if (!isValidProvider(provider)) {
    recordOAuthDiagnostic({
      provider,
      stage: "callback_received",
      status: "failure",
      reason: "unknown_provider",
    });
    return failRedirect("error", "unknown_provider");
  }

  const verified = verifySignedState(state);
  if (!verified.valid) {
    recordOAuthDiagnostic({
      provider,
      stage: "state_verified",
      status: "failure",
      reason: `bad_state:${verified.reason}`,
    });
    return failRedirect("error", `bad_state:${verified.reason}`);
  }

  if (verified.payload.provider !== provider && !(provider === "google_business" && verified.payload.provider === "google")) {
    recordOAuthDiagnostic({
      provider,
      stage: "state_verified",
      status: "failure",
      reason: "provider_mismatch",
      details: { expected: verified.payload.provider, received: provider },
    });
    return failRedirect("error", "provider_mismatch");
  }

  recordOAuthDiagnostic({
    provider,
    stage: "state_verified",
    status: "success",
    details: { redirectTo: verified.payload.redirectTo },
  });

  const service = createSupabaseServiceClient();

  // State must exist, be unconsumed, and unexpired server-side
  const { data: stateRow } = await service
    .from("social_oauth_states")
    .select("id, consumed_at, expires_at, created_by")
    .eq("state_hash", verified.hash)
    .maybeSingle();

  if (!stateRow) {
    recordOAuthDiagnostic({
      provider,
      stage: "state_verified",
      status: "failure",
      reason: "state_not_found",
    });
    return failRedirect("error", "state_not_found");
  }

  if (stateRow.consumed_at) {
    recordOAuthDiagnostic({
      provider,
      stage: "state_verified",
      status: "failure",
      reason: "state_already_used",
    });
    return failRedirect("error", "state_already_used");
  }

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    recordOAuthDiagnostic({
      provider,
      stage: "state_verified",
      status: "failure",
      reason: "state_expired",
    });
    return failRedirect("error", "state_expired");
  }

  // Consume immediately to prevent replay, before doing the token exchange.
  await service
    .from("social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", stateRow.id);

  const redirectUri = getCanonicalSocialRedirectUri(provider, origin);

  try {
    recordOAuthDiagnostic({
      provider,
      stage: "token_exchange",
      status: "info",
      details: { redirectUri },
    });

    const result = await getProvider(provider).exchangeCodeForToken(code, redirectUri, {
      state,
      origin,
    });

    recordOAuthDiagnostic({
      provider,
      stage: "identity_fetch",
      status: "success",
      details: {
        externalAccountId: result.externalAccountId,
        hasDisplayName: !!result.displayName,
        hasUsername: !!result.username,
        scopesCount: result.scopes?.length ?? 0,
      },
    });

    const redirectTo = verified.payload.redirectTo || "/admin/social";
    const isAppFlow = redirectTo.startsWith("/app");

    if (isAppFlow) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id || stateRow.created_by;

      if (userId) {
        const username = result.username || result.displayName || result.externalAccountId;
        let formattedHandle = username;
        if (["instagram", "threads"].includes(provider)) {
          formattedHandle = username.startsWith("@") ? username : `@${username}`;
        }

        const canonicalPlatformKey = provider === "google" ? "google_business" : provider;

        // 1. Check if an active tenant is specified in state or if user already has a workspace
        let targetTenantId: string | null = (verified.payload.tenantId as string) || null;
        if (!targetTenantId && userId) {
          const { data: mems } = await service
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", userId);
          // Only auto-resolve when the membership is unambiguous. A user
          // with more than one tenant must never have a connector silently
          // attached to an arbitrarily-picked one (Postgres gives no
          // ordering guarantee without an explicit ORDER BY, so an earlier
          // `.limit(1)` here was picking whichever row happened to come
          // back first) -- fall through to the metadata-only path instead,
          // to be reconciled once the caller supplies an explicit tenantId.
          if (mems && mems.length === 1) {
            targetTenantId = mems[0].tenant_id;
          }
        }

        // Verify membership if tenant was explicitly specified in state
        if (targetTenantId && verified.payload.tenantId) {
          const { data: memberCheck } = await service
            .from("tenant_members")
            .select("id")
            .eq("tenant_id", targetTenantId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!memberCheck) {
            targetTenantId = null; // Unverified tenant ID from state ignored
          }
        }

        // 2. If tenant exists, provision directly to canonical tenant relational tables
        if (targetTenantId) {
          try {
            await upsertConnectedAccount(service, {
              ownerId: userId,
              tenantId: targetTenantId,
              platform: canonicalPlatformKey as Platform,
              providerAccountId: result.externalAccountId,
              username: formattedHandle,
              displayName: result.displayName || result.username || canonicalPlatformKey,
              avatarUrl: result.profilePictureUrl || null,
              permissions: result.scopes ?? [],
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              expiresInSeconds: result.expiresInSeconds,
            });

            if (provider === "google" || provider === "google_business") {
              await service.from("search_google_connections").upsert(
                {
                  tenant_id: targetTenantId,
                  status: "connected",
                  connected_by_user_id: userId,
                  connected_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id" }
              );
            }
          } catch (upsertErr) {
            console.warn("oauth callback: non-fatal direct tenant upsert trace", upsertErr);
          }
        }

        // 3. Always maintain user metadata for seamless cross-device rehydration & audit recovery
        const { data: userData } = await service.auth.admin.getUserById(userId);
        const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const existingConnections = (existingMeta.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

        const connectionPayload = {
          provider: canonicalPlatformKey,
          providerAccountId: result.externalAccountId,
          username: formattedHandle,
          displayName: result.displayName || result.username || canonicalPlatformKey,
          avatarUrl: result.profilePictureUrl || null,
          scopes: result.scopes,
          status: "connected",
          authorized: true,
          providerLabel: PROVIDER_LABELS[canonicalPlatformKey] || "Google",
          connectedAt: new Date().toISOString(),
        };

        await service.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...existingMeta,
            onboarding_oauth_connections: {
              ...existingConnections,
              [canonicalPlatformKey]: connectionPayload,
            },
          },
        });
      }

      await recordAudit({
        actorType: "USER",
        actorId: userId,
        action: "account.connect",
        targetType: "social_account",
        summary: `Connected ${provider} account in app workspace`,
        meta: { provider_account_id: result.externalAccountId },
      });

      recordOAuthDiagnostic({
        provider,
        stage: "connection_persisted",
        status: "success",
        details: { target: "canonical_and_metadata", userId },
      });

      const successUrl = new URL(redirectTo, origin);
      successUrl.searchParams.set("oauth", "success");
      successUrl.searchParams.set("provider", provider === "google" ? "google_business" : provider);
      successUrl.searchParams.set("connected", provider === "google" ? "google_business" : provider);

      return NextResponse.redirect(successUrl.toString());
    }

    // Admin flow
    const admin = await requireAdmin();
    if (!admin.ok) {
      recordOAuthDiagnostic({
        provider,
        stage: "connection_persisted",
        status: "failure",
        reason: "not_authorized",
      });
      return failRedirect("error", "not_authorized");
    }

    await upsertConnectedAccount(service, {
      ownerId: admin.userId,
      platform: provider as Platform,
      providerAccountId: result.externalAccountId,
      username: result.username ?? result.displayName ?? result.externalAccountId,
      displayName: result.displayName ?? null,
      avatarUrl: result.profilePictureUrl ?? null,
      permissions: result.scopes,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? null,
      expiresInSeconds: result.expiresInSeconds ?? null,
    });

    await recordAudit({
      actorType: "USER",
      actorId: admin.userId,
      action: "account.connect",
      targetType: "social_account",
      summary: `Connected ${provider} account`,
      meta: { provider_account_id: result.externalAccountId },
    });

    recordOAuthDiagnostic({
      provider,
      stage: "connection_persisted",
      status: "success",
      details: { target: "social_accounts", ownerId: admin.userId },
    });

    const adminTarget = new URL(redirectTo, origin);
    adminTarget.searchParams.set("oauth", "success");
    adminTarget.searchParams.set("provider", provider);
    adminTarget.searchParams.set("connected", provider);

    return NextResponse.redirect(adminTarget.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`${provider} OAuth callback failed:`, message);

    recordOAuthDiagnostic({
      provider,
      stage: "token_exchange",
      status: "failure",
      reason: message,
      error: err,
    });

    await recordAudit({
      actorType: "SYSTEM",
      action: "account.connect_failed",
      summary: `${provider} connect failed: ${message}`,
    });

    return failRedirect("error", "token_exchange_failed");
  }
}

export const dynamic = "force-dynamic";
