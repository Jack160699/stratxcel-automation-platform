/**
 * Canonical application origin for transactional email links.
 * Aligns with payment-links / WhatsApp embedded-signup defaults:
 * NEXT_PUBLIC_APP_URL → APP_BASE_URL → https://www.stratxcel.in
 *
 * Never derives the app origin from SUPPORT_EMAIL domain.
 */
export const CANONICAL_APP_ORIGIN_DEFAULT = "https://www.stratxcel.in";

export function resolveCanonicalAppOrigin(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string {
  const explicit =
    (typeof env.NEXT_PUBLIC_APP_URL === "string" && env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof env.APP_BASE_URL === "string" && env.APP_BASE_URL.trim()) ||
    "";
  const raw = explicit || CANONICAL_APP_ORIGIN_DEFAULT;
  return raw.replace(/\/$/, "");
}
