import { CANONICAL_ORIGIN } from "@/lib/reporting/site";

/**
 * Returns the exact, canonical OAuth redirect URI for a social provider.
 *
 * In production/staging, always returns the deterministic HTTPS URI
 * `https://www.stratxcel.in/api/social/oauth/:provider/callback`
 * to guarantee an exact match with the registered URIs in Meta, LinkedIn,
 * Google, and Threads developer consoles (preventing www vs non-www mismatches).
 *
 * In local development, uses the local request origin (e.g. `http://localhost:3322`).
 */
export function getCanonicalSocialRedirectUri(
  provider: string,
  requestOrigin?: string | null
): string {
  let origin = CANONICAL_ORIGIN;

  if (requestOrigin && (requestOrigin.includes("localhost") || requestOrigin.includes("127.0.0.1"))) {
    origin = requestOrigin;
  }

  // Ensure no trailing slash on origin
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/api/social/oauth/${provider}/callback`;
}
