import { NextResponse, after, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState, resolveOAuthFailureRedirect } from "@/lib/social/oauth-state";
import { isTenantMember } from "@/lib/social/tenant-membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { upsertConnectedAccount, type Platform } from "@/lib/social/repositories/accounts";
import { recordAudit } from "@/lib/social/repositories/system";
import { getCanonicalSocialRedirectUri } from "@/lib/social/oauth-origin";
import { recordOAuthDiagnostic } from "@/lib/social/oauth-diagnostics";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { attemptAutoActivatePackageAutopilot } from "@/lib/social/package-autopilot";

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

  // Determine fallback fail destination from state if available.
  // Found live during E2E testing: this used to collapse ANY /app-prefixed
  // redirectTo (e.g. /app/integrations, where a real customer clicks
  // "Reconnect account") down to the literal string "/app" -- so every
  // callback failure (expired state, token exchange error, persistence
  // error) silently bounced the customer to the dashboard home instead of
  // back to the page they were reconnecting from, with no visible reason
  // (home never reads these query params). The customer sees "nothing
  // happened" and the connector still shows disconnected -- indistinguishable
  // from success never having been attempted. Preserve the real redirectTo
  // so the failure lands back where the customer can see the error banner.
  let fallbackRedirect = "/admin/social";
  if (state) {
    const v = verifySignedState(state);
    if (v.valid) {
      fallbackRedirect = resolveOAuthFailureRedirect(v.payload.redirectTo, fallbackRedirect);
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

      if (!userId) {
        recordOAuthDiagnostic({
          provider,
          stage: "connection_persisted",
          status: "failure",
          reason: "not_authenticated",
        });
        // Every other failure branch below writes an audit trail on the
        // success path only (recordAudit's own action.connect); this branch
        // (and the sibling missing_tenant/persistence_failed branches)
        // never did, on either success or failure, so a customer-reported
        // "it failed" had zero queryable trail beyond a Vercel console log
        // this session has no access to. social_audit_events is already the
        // real, service-role-writable, staff-readable channel for this.
        await recordAudit({
          actorType: "SYSTEM",
          action: "account.connect_failed",
          summary: `${provider} connect failed: not_authenticated`,
        }).catch(() => {});
        return failRedirect("error", "not_authenticated");
      }

      const username = result.username || result.displayName || result.externalAccountId;
      let formattedHandle = username;
      if (["instagram", "threads"].includes(provider)) {
        formattedHandle = username.startsWith("@") ? username : `@${username}`;
      }

      const canonicalPlatformKey = provider === "google" ? "google_business" : provider;

      // 1. Resolve tenant:
      // Priority 1: Trusted signed OAuth state
      let targetTenantId: string | null = (verified.payload.tenantId as string) || null;

      // Priority 2: Fallback ONLY when the user has exactly one tenant
      if (!targetTenantId && userId) {
        const { data: mems, error: memsErr } = await service
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", userId);
        if (!memsErr && mems && mems.length === 1) {
          targetTenantId = mems[0].tenant_id;
        }
      }

      // If tenantId was supplied in state, verify user membership.
      // Found live during E2E testing (see isTenantMember's own comment):
      // this used to select("id") from tenant_members, a table with no id
      // column, silently discarding the resulting DB error as "not a
      // member" -- wiping targetTenantId and failing every reconnect from
      // an existing workspace, for any provider, with a generic
      // "missing_tenant" error, even for the tenant's real owner.
      if (targetTenantId && verified.payload.tenantId) {
        const isMember = await isTenantMember(service, targetTenantId, userId);
        if (!isMember) {
          targetTenantId = null; // Unverified tenant ID from state ignored
        }
      }

      // 2. Persist to relational tables if tenant is resolved
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
            metadata: result.metadata,
          });

          if (provider === "google" || provider === "google_business") {
            // Found live during E2E testing: this used to mark status
            // "connected" without ever storing the refresh token or granted
            // scopes it already had in `result` (used two lines above for the
            // social_accounts upsert) -- so every real customer who completed
            // Google OAuth ended up with a "connected" row that could never
            // actually mint a live access token. The Search & Discovery UI
            // then correctly detected the missing token and downgraded the
            // customer-visible status back to "NOT CONNECTED", contradicting
            // the DB's own status column and the customer's lived experience
            // of having just approved the consent screen.
            // Only overwrite the stored refresh token when Google actually
            // issued a new one this round (Google omits it on repeat
            // consents) -- never null out a previously-stored valid token.
            const googlePatch: Record<string, unknown> = {
              tenant_id: targetTenantId,
              status: "connected",
              connected_by_user_id: userId,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              granted_scopes: result.scopes ?? [],
            };
            if (result.refreshToken) {
              const vault = createDevEncryptedVault(service);
              googlePatch.encrypted_refresh_token_ref = await vault.store(result.refreshToken);
            }

            const { error: gErr } = await service.from("search_google_connections").upsert(googlePatch, {
              onConflict: "tenant_id",
            });
            if (gErr) {
              throw new Error(`Google connection upsert failed: ${gErr.message}`);
            }
          }
        } catch (upsertErr) {
          const errMsg = upsertErr instanceof Error ? upsertErr.message : "upsert_failed";
          console.error("oauth callback: tenant persistence failed:", errMsg);
          recordOAuthDiagnostic({
            provider,
            stage: "connection_persisted",
            status: "failure",
            reason: `persistence_failed:${errMsg}`,
          });
          // See the not_authenticated branch above: this is the queryable
          // record of the *real* thrown message, not just a generic
          // "persistence_failed" bucket, for a failure mode that previously
          // left no trail at all outside inaccessible server logs.
          await recordAudit({
            actorType: "SYSTEM",
            actorId: userId,
            action: "account.connect_failed",
            summary: `${provider} connect failed (tenant ${targetTenantId}): ${errMsg}`,
          }).catch(() => {});
          return failRedirect("error", "persistence_failed");
        }
      } else {
        // No tenant resolved:
        // For active workspace pages (e.g. /app/brand, /app/integrations), NEVER allow connection without tenant
        const isPreWorkspaceOnboarding = redirectTo === "/app" || redirectTo === "/app/onboarding";
        if (!isPreWorkspaceOnboarding) {
          recordOAuthDiagnostic({
            provider,
            stage: "connection_persisted",
            status: "failure",
            reason: "missing_tenant",
          });
          await recordAudit({
            actorType: "SYSTEM",
            actorId: userId,
            action: "account.connect_failed",
            summary: `${provider} connect failed: missing_tenant (stateTenantId=${verified.payload.tenantId ?? "none"})`,
          }).catch(() => {});
          return failRedirect("error", "missing_tenant");
        }
        // Pre-workspace onboarding: no tenant exists yet, so this cannot
        // write a tenant-scoped social_accounts row. Found live during E2E
        // testing: the comment here used to say "NEVER write to
        // social_accounts... it will be safely provisioned by
        // provisionTenantConnectorsFromMetadata once tenant is created" —
        // but that function only ever had display metadata to work with
        // (username/providerAccountId/scopes, no token), because the real
        // access/refresh token obtained right here was simply discarded
        // when this branch did nothing. Every account a customer connected
        // during onboarding then got fabricated as status: CONNECTED /
        // token_health: HEALTHY once the tenant was created, with no
        // usable token behind it anywhere — confirmed live on a real
        // production tenant (four social_accounts rows, zero social_tokens
        // rows). upsertConnectedAccount already supports an owner-scoped
        // row (tenantId omitted) for exactly this pre-tenant case — use it
        // so the real token is actually persisted, and provisioning can
        // link this same row (preserving its social_tokens) once the
        // tenant exists instead of fabricating a fresh, tokenless one.
        try {
          await upsertConnectedAccount(service, {
            ownerId: userId,
            platform: canonicalPlatformKey as Platform,
            providerAccountId: result.externalAccountId,
            username: formattedHandle,
            displayName: result.displayName || result.username || canonicalPlatformKey,
            avatarUrl: result.profilePictureUrl || null,
            permissions: result.scopes ?? [],
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresInSeconds: result.expiresInSeconds,
            metadata: result.metadata,
          });
        } catch (preTenantErr) {
          // Non-fatal: the onboarding_oauth_connections metadata write below
          // still lets the wizard show "Connected" and lets provisioning
          // retry later — but log the real reason rather than staying silent.
          console.error("oauth callback: pre-tenant token persistence failed:", preTenantErr instanceof Error ? preTenantErr.message : String(preTenantErr));
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

      await recordAudit({
        actorType: "USER",
        actorId: userId,
        action: "account.connect",
        targetType: "social_account",
        summary: `Connected ${provider} account in app workspace`,
        meta: { provider_account_id: result.externalAccountId, tenant_id: targetTenantId },
      });

      // Social Autopilot — Complete Repair mission: the second of the two
      // real auto-activation trigger moments (see attemptAutoActivate
      // PackageAutopilot's own doc comment). A brand-new paying customer's
      // payment webhook almost always fires BEFORE onboarding (brand
      // profile + a connected account) is done, so activatePackageAutopilot's
      // own real prerequisite checks correctly reject it there -- THIS is
      // typically the actual last onboarding step, so it's the real moment
      // a fresh subscriber becomes eligible. Fire-and-forget via after():
      // can run real Gemini calls, must never delay the OAuth redirect.
      // Only for a real, tenant-scoped connection (targetTenantId set) --
      // the pre-workspace-onboarding branch below has no tenant yet.
      if (targetTenantId) {
        const tenantIdForActivation = targetTenantId;
        after(async () => {
          try {
            await attemptAutoActivatePackageAutopilot(service, { tenantId: tenantIdForActivation });
          } catch (err) {
            console.error("[Social Autopilot] Best-effort auto-activation after connect failed", err);
          }
        });
      }

      recordOAuthDiagnostic({
        provider,
        stage: "connection_persisted",
        status: "success",
        details: { target: "canonical_and_metadata", userId, tenantId: targetTenantId },
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
      metadata: result.metadata,
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
// The auto-activation after() work triggered above (planPackagePeriod +
// prepareNearTermPackageItems, real AI calls) is still bound by the whole
// invocation's maxDuration -- same 300s budget this codebase already uses
// for every other real AI/publish chain (see api/webhook/razorpay's own
// comment on this exact pattern).
export const maxDuration = 300;
