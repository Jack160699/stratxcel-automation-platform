import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState } from "@/lib/social/oauth-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { upsertConnectedAccount, type Platform } from "@/lib/social/repositories/accounts";
import { recordAudit } from "@/lib/social/repositories/system";

/**
 * GET /api/social/oauth/:provider/callback
 * Validates the signed state (single-use, expiring, admin-issued), exchanges
 * the authorization code for tokens, encrypts them, and upserts the
 * connected account + its token row. Never returns tokens to the browser.
 * Runs via service-role: social_accounts/social_tokens writes here happen
 * before/independent of any owner-scoped RLS path decision, and this route
 * has no cookie-bound Supabase session of its own beyond requireAdmin()'s
 * check.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const origin = req.nextUrl.origin;
  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}/admin/social?connect_error=${encodeURIComponent(reason)}`);

  const admin = await requireAdmin();
  if (!admin.ok) return failRedirect("not_authorized");

  if (!isValidProvider(provider)) return failRedirect("unknown_provider");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return failRedirect(`provider_error:${oauthError}`);
  if (!code || !state) return failRedirect("missing_code_or_state");

  const verified = verifySignedState(state);
  if (!verified.valid) return failRedirect(`bad_state:${verified.reason}`);
  if (verified.payload.provider !== provider) return failRedirect("provider_mismatch");

  const service = createSupabaseServiceClient();

  // State must exist, be unconsumed, and unexpired server-side (belt & braces
  // beyond the signature/expiry check already in the token itself).
  const { data: stateRow } = await service
    .from("social_oauth_states")
    .select("id, consumed_at, expires_at")
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

    const redirectTo = verified.payload.redirectTo || "/admin/social";
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
