/**
 * Customer-facing website input normalization for Search Growth onboarding.
 *
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 17:
 * the real, live server-side gate on manual "Run Search Analysis" submissions
 * (app/api/platform/search/run/route.ts's old `validSite()`) called
 * `new URL(value)` directly on whatever the customer typed. `new URL()`
 * throws for a bare domain with no scheme -- so a customer typing exactly
 * what they'd naturally type ("stratxcel.in", "www.jandarpan.news") was
 * rejected with SEARCH_INVALID_REQUEST, while only a fully-qualified
 * "https://stratxcel.in" was ever accepted. Customers should not need to
 * know URL syntax to enter their own website.
 *
 * Deliberately reuses ../research/normalize.ts's `normalizeResearchUrl` for
 * every actual safety property (SSRF-relevant scheme/host rejection,
 * userinfo rejection, length limits, lowercase host, tracking-param/hash
 * stripping) rather than re-implementing it -- the only thing this module
 * adds on top is the one piece that context intentionally omits: defaulting
 * a missing scheme to https:// before parsing, which is correct for a
 * customer-facing "type your website" field but would be the wrong default
 * for `normalizeResearchUrl`'s stricter evidence-URL callers.
 */
import { normalizeResearchUrl, UnsafeResearchUrlError } from "./research/normalize.ts";

export type NormalizedWebsiteInput =
  | { ok: true; url: string; hostname: string; matchKey: string }
  | { ok: false; reason: string };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The identity used ONLY to recognize "is this the same website" for
 * matching against an already-known source (an existing search_projects
 * row, a connected Search Console property, etc.) -- never used to rewrite
 * what gets stored or crawled. Deliberately does not delete a meaningful
 * www/non-www distinction from the resolved URL itself (brief: "Do NOT
 * blindly delete www if the difference is technically meaningful for the
 * site") -- this key only powers duplicate/match *recognition*.
 */
export function websiteMatchKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${host}${path}`;
}

/**
 * Normalizes a customer-typed website into a safe, resolvable URL.
 * Accepts (and treats identically to their https:// equivalent, modulo
 * the scheme itself): bare domains, www/non-www, http/https, mixed case,
 * surrounding whitespace, and a trailing slash on the bare root path.
 * Rejects only genuinely invalid/unsafe input -- never over-restricts a
 * normal domain.
 */
export function normalizeWebsiteInput(raw: unknown): NormalizedWebsiteInput {
  if (typeof raw !== "string") return { ok: false, reason: "invalid_input" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let normalized: ReturnType<typeof normalizeResearchUrl>;
  try {
    normalized = normalizeResearchUrl(candidate);
  } catch (err) {
    // UnsafeResearchUrlError.code is a fixed "unsafe_research_url" marker
    // for every case; the actual specific reason (invalid_url,
    // unsafe_url_protocol, unsafe_private_host:<host>, etc.) is on .message.
    if (err instanceof UnsafeResearchUrlError) return { ok: false, reason: err.message };
    return { ok: false, reason: "invalid_url" };
  }

  let url: URL;
  try {
    url = new URL(normalized.url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  // "remove unnecessary trailing slash" (brief) -- only the bare root path
  // (WHATWG URL always serializes a special-scheme root as "/", setting
  // pathname = "" is a no-op on .href, so the strip has to happen on the
  // string form) -- never touch a real path the customer intentionally
  // provided, e.g. "/blog/" must stay exactly "/blog/", not become "/blog".
  const resolved = url.pathname === "/" ? url.href.replace(/\/$/, "") : url.href;
  const matchKey = websiteMatchKey(resolved);
  if (!matchKey) return { ok: false, reason: "invalid_url" };

  return { ok: true, url: resolved, hostname: normalized.domain, matchKey };
}
