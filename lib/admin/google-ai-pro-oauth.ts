import { CANONICAL_ORIGIN } from "../reporting/site.ts";

/**
 * Single source of truth for the Google AI Pro Founder connector OAuth redirect URI.
 *
 * MUST match exactly what is registered in Google Cloud Console →
 * Google Auth Platform → Clients → OAuth 2.0 Client →
 * Authorized redirect URIs.
 *
 * In production:  https://www.stratxcel.in/api/admin/personal-connectors/google-ai-pro/callback
 * In development: http://localhost:3000/api/admin/personal-connectors/google-ai-pro/callback
 *
 * We never derive the host from request.url because on Vercel the
 * request may arrive with a preview-deployment hostname (e.g.
 * stratxcel-o8dbwlrs1-jack160699s-projects.vercel.app), which would
 * produce a redirect_uri_mismatch error from Google.
 *
 * Override production base via GOOGLE_AI_PRO_OAUTH_REDIRECT_URI env var
 * if you need to point at an explicit URI (useful for staging domains).
 */
export const GOOGLE_AI_PRO_CALLBACK_PATH =
  "/api/admin/personal-connectors/google-ai-pro/callback";

export function getGoogleAiProRedirectUri(requestOrigin?: string | null): string {
  // 1. Explicit override wins (full URI, not just origin)
  if (process.env.GOOGLE_AI_PRO_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_AI_PRO_OAUTH_REDIRECT_URI;
  }

  // 2. In local development, derive from the incoming request origin
  if (
    requestOrigin &&
    (requestOrigin.includes("localhost") || requestOrigin.includes("127.0.0.1"))
  ) {
    const cleanOrigin = requestOrigin.replace(/\/+$/, "");
    return `${cleanOrigin}${GOOGLE_AI_PRO_CALLBACK_PATH}`;
  }

  // 3. Production: always the canonical stratxcel.in domain
  return `${CANONICAL_ORIGIN}${GOOGLE_AI_PRO_CALLBACK_PATH}`;
}

/**
 * Safe diagnostic info to log — never includes secrets.
 * Log this when initiating the OAuth flow to aid debugging.
 */
export function buildGoogleAiProOAuthDiagnostics(
  clientId: string,
  redirectUri: string,
  env: string
): string {
  const clientSuffix = clientId.length > 8 ? `...${clientId.slice(-8)}` : clientId;
  return `[Google AI Pro OAuth] env=${env} client=${clientSuffix} redirect_uri=${redirectUri}`;
}
