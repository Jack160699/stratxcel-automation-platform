import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { CANONICAL_ORIGIN } from "@/lib/reporting/site";
import {
  verifyGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  persistGoogleTokens,
} from "@/lib/connectors/google-oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/connectors/google/callback
 * Handles Google OAuth callback, verifies HMAC state, exchanges code for tokens,
 * vaults refresh token, persists connection and granted capabilities, and redirects.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");
  const googleErrorDesc = url.searchParams.get("error_description");

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || CANONICAL_ORIGIN || url.origin;

  const redirectTarget = (path: string, params: Record<string, string>) => {
    const target = new URL(path, origin);
    for (const [k, v] of Object.entries(params)) {
      target.searchParams.set(k, v);
    }
    return Response.redirect(target.toString());
  };

  if (!state) {
    return redirectTarget("/admin/connectors", {
      error: googleError || "missing_state",
      error_description: googleErrorDesc || "Google OAuth response did not include a valid state parameter.",
    });
  }

  const verified = verifyGoogleOAuthState(state);
  if (!verified.ok) {
    return redirectTarget("/admin/connectors", {
      error: "invalid_state",
      error_description: `State verification failed: ${verified.reason}`,
    });
  }

  if (googleError) {
    return redirectTarget(verified.redirectTo, {
      error: googleError,
      error_description: googleErrorDesc || "Google OAuth authorization was denied or failed.",
    });
  }

  if (!code) {
    return redirectTarget(verified.redirectTo, {
      error: "missing_code",
      error_description: "Google did not return an authorization code.",
    });
  }

  const redirectUri = new URL("/api/platform/connectors/google/callback", origin).toString();

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code, redirectUri);
    const { supabase } = getTenantServiceContext();

    await persistGoogleTokens(supabase, {
      tenantId: verified.tenantId,
      userId: verified.userId,
      tokens,
    });

    return redirectTarget(verified.redirectTo, {
      connected: "google",
      status: "success",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    console.error("[google-oauth] Callback error:", message);
    return redirectTarget(verified.redirectTo, {
      error: "token_exchange_failed",
      error_description: message,
    });
  }
}
