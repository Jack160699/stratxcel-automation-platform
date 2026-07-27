import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState } from "@/lib/social/oauth-state";
import { encryptToken } from "@/lib/social/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/social/oauth/:provider/callback
 * Validates the signed state (single-use, expiring, admin-issued), exchanges
 * the authorization code for tokens, encrypts them, and upserts the
 * connected account. Never returns tokens to the browser.
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

    const accessTokenEnc = encryptToken(result.accessToken);
    const refreshTokenEnc = result.refreshToken ? encryptToken(result.refreshToken) : null;
    const expiresAt = result.expiresInSeconds
      ? new Date(Date.now() + result.expiresInSeconds * 1000).toISOString()
      : null;

    const { error } = await service.from("social_accounts").upsert(
      {
        provider,
        external_account_id: result.externalAccountId,
        display_name: result.displayName ?? null,
        username: result.username ?? null,
        profile_picture_url: result.profilePictureUrl ?? null,
        status: "connected",
        scopes: result.scopes,
        access_token_ciphertext: accessTokenEnc.ciphertext,
        access_token_iv: accessTokenEnc.iv,
        access_token_tag: accessTokenEnc.tag,
        refresh_token_ciphertext: refreshTokenEnc?.ciphertext ?? null,
        refresh_token_iv: refreshTokenEnc?.iv ?? null,
        refresh_token_tag: refreshTokenEnc?.tag ?? null,
        token_expires_at: expiresAt,
        last_health_check_at: new Date().toISOString(),
        last_error: null,
        connected_by: admin.userId,
      },
      { onConflict: "provider,external_account_id" }
    );

    if (error) {
      console.error("social_accounts upsert failed:", error.message);
      return failRedirect("persist_failed");
    }

    await service.from("social_system_events").insert({
      category: "oauth",
      level: "info",
      message: `${provider} account connected`,
      meta: { external_account_id: result.externalAccountId },
    });

    const redirectTo = verified.payload.redirectTo || "/admin/social";
    return NextResponse.redirect(`${origin}${redirectTo}?connected=${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`${provider} OAuth callback failed:`, message);
    await service.from("social_system_events").insert({
      category: "oauth",
      level: "error",
      message: `${provider} connect failed`,
      meta: { error: message },
    });
    return failRedirect("token_exchange_failed");
  }
}

export const dynamic = "force-dynamic";
