import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { upsertConnectedAccount, type Platform } from "@/lib/social/repositories/accounts";
import { recordAudit } from "@/lib/social/repositories/system";

/**
 * GET /api/social/oauth/:provider/callback
 *
 * Canonical OAuth callback for all social connectors (Admin + Onboarding).
 *
 * Validates the signed state token, exchanges code for token, and:
 * - Onboarding (redirectTo=/app): records verified connection proof in user metadata (pre-tenant).
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

  // Determine fallback fail destination from state if available
  let fallbackRedirect = "/admin/social";
  if (state) {
    const v = verifySignedState(state);
    if (v.valid && v.payload.redirectTo?.startsWith("/app")) {
      fallbackRedirect = "/app";
    }
  }

  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}${fallbackRedirect}?connect_error=${encodeURIComponent(reason)}`);

  if (oauthError) return failRedirect(`provider_error:${oauthError}`);
  if (!code || !state) return failRedirect("missing_code_or_state");

  if (!isValidProvider(provider)) return failRedirect("unknown_provider");

  const verified = verifySignedState(state);
  if (!verified.valid) return failRedirect(`bad_state:${verified.reason}`);
  if (verified.payload.provider !== provider) return failRedirect("provider_mismatch");

  const service = createSupabaseServiceClient();

  // State must exist, be unconsumed, and unexpired server-side
  const { data: stateRow } = await service
    .from("social_oauth_states")
    .select("id, consumed_at, expires_at, created_by")
    .eq("state_hash", verified.hash)
    .maybeSingle();

  if (!stateRow) return failRedirect("state_not_found");
  if (stateRow.consumed_at) return failRedirect("state_already_used");
  if (new Date(stateRow.expires_at).getTime() < Date.now()) return failRedirect("state_expired");

  // Consume immediately to prevent replay, before doing the token exchange.
  await service
    .from("social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", stateRow.id);

  const redirectUri = new URL(
    `/api/social/oauth/${provider}/callback`,
    origin
  ).toString();

  try {
    const result = await getProvider(provider).exchangeCodeForToken(code, redirectUri);
    const redirectTo = verified.payload.redirectTo || "/admin/social";
    const isOnboarding = redirectTo.startsWith("/app");

    if (isOnboarding) {
      // Pre-tenant onboarding connection proof saved to user metadata
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id || stateRow.created_by;

      if (userId) {
        const { data: userData } = await service.auth.admin.getUserById(userId);
        const existingMeta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const existingConnections = (existingMeta.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

        await service.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...existingMeta,
            onboarding_oauth_connections: {
              ...existingConnections,
              [provider]: {
                providerAccountId: result.externalAccountId,
                username: result.username ?? result.displayName ?? result.externalAccountId,
                displayName: result.displayName ?? null,
                avatarUrl: result.profilePictureUrl ?? null,
                scopes: result.scopes,
                connectedAt: new Date().toISOString(),
              },
            },
          },
        });
      }

      await recordAudit({
        actorType: "USER",
        actorId: userId,
        action: "account.connect",
        targetType: "social_account",
        summary: `Connected ${provider} account during onboarding`,
        meta: { provider_account_id: result.externalAccountId },
      });

      return NextResponse.redirect(`${origin}${redirectTo}?connected=${provider}`);
    }

    // Admin flow
    const admin = await requireAdmin();
    if (!admin.ok) return failRedirect("not_authorized");

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

    return NextResponse.redirect(`${origin}${redirectTo}?connected=${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`${provider} OAuth callback failed:`, message);
    await recordAudit({
      actorType: "SYSTEM",
      action: "account.connect_failed",
      summary: `${provider} connect failed: ${message}`,
    });
    return failRedirect("token_exchange_failed");
  }
}

export const dynamic = "force-dynamic";
