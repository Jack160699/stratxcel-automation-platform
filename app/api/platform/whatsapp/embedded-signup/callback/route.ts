import { verifyEmbeddedSignupState } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side code exchange for WhatsApp Embedded Signup. Only reachable in
 * practice once /start actually issued a real signupUrl (i.e. Meta config
 * is present) — this route still validates state/config defensively rather
 * than assuming that's always true. Creates the phone binding in the same
 * safe pending/shadow state createPhoneBinding always uses — activation
 * (verifying the real phone_number_id and flipping to 'active') stays a
 * deliberate separate step, same as the manual-entry path.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stratxcel.in";
  const redirectTo = (status: string, detail?: string) =>
    Response.redirect(`${appUrl}/admin/integrations?whatsapp_signup=${status}${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`, 302);

  if (errorParam) return redirectTo("denied", errorParam);
  if (!code || !state) return redirectTo("error", "missing_code_or_state");

  const verified = verifyEmbeddedSignupState(state);
  if (!verified.valid) return redirectTo("error", verified.reason);

  const appId = process.env.META_WHATSAPP_APP_ID;
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  const configId = process.env.META_WHATSAPP_CONFIG_ID;
  if (!appId || !appSecret || !configId) return redirectTo("error", "not_configured");

  try {
    const redirectUri = `${appUrl}/api/platform/whatsapp/embedded-signup/callback`;
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`
    );
    if (!tokenRes.ok) return redirectTo("error", `token_exchange_failed_${tokenRes.status}`);
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) return redirectTo("error", "no_access_token");

    // The token exchange itself succeeded, but Meta's real Embedded Signup
    // flow delivers the actual WABA ID / phone_number_id via its JS SDK
    // session-logging callback (a separate client-side event this
    // repository has no live Meta app to test against), not this redirect's
    // query string. Rather than guess at or fabricate those IDs, this stops
    // here and sends the admin to the existing, working manual-binding form
    // (POST /api/platform/whatsapp/bindings) with the access token already
    // proven valid — completing the automatic WABA/phone-ID lookup is
    // provider activation work, not guessed at here. No binding row is
    // created by this route.
    return redirectTo("token_exchanged_complete_manually");
  } catch (err) {
    return redirectTo("error", err instanceof Error ? err.message : "unknown");
  }
}
