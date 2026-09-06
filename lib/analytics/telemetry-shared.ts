import { createHash } from "crypto";

/**
 * Pure, framework-free helpers shared by app/api/telemetry/route.ts and
 * lib/analytics/track-server.ts. Deliberately has zero Next.js / Supabase /
 * "server-only" imports so it can be exercised directly by a plain
 * `node --experimental-strip-types` test (see lib/analytics/__tests__),
 * matching this repo's test convention, without re-implementing this logic
 * a second time inside the test file the way
 * lib/rbac/__tests__/public-audit-requests.test.ts has to for its
 * server-only route.
 */

/** Distinct salt namespace from public/audit-requests' getIPHash() -- see
 * app/api/public/audit-requests/route.ts. Telemetry and the audit-intake
 * form are different ingestion surfaces with different retention/access
 * shapes; keeping the salts separate means a leak of one never lets the
 * other's IP hashes be correlated against it. */
const IP_HASH_SALT = "sx_telemetry_salt_";

/** sha256(salt + ip), truncated to 16 hex chars -- same shape as
 * public_audit_requests.request_ip_hash. Never store or return the raw IP. */
export function hashTelemetryIp(rawIp: string): string {
  const ip = rawIp && rawIp.trim() ? rawIp.trim() : "127.0.0.1";
  return createHash("sha256").update(`${IP_HASH_SALT}${ip}`).digest("hex").slice(0, 16);
}

/** Minimal structural type so this stays framework-free -- both a Fetch
 * API `Headers` object and Next's `Request.headers` satisfy it. */
export interface HeaderReader {
  get(name: string): string | null;
}

export function extractClientIp(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const realIp = headers.get("x-real-ip") ?? "";
  return forwarded.split(",")[0]?.trim() || realIp || "127.0.0.1";
}

export type UaClass = "bot" | "human" | "unknown";

/** Same signature set the manual Supabase audit for this feature used to
 * classify the three rows in public_audit_requests -- kept in sync so
 * ad-hoc SQL audits and this table's own ua_class column agree. */
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|googlebot|bingbot|python-requests|curl\/|axios\/|go-http-client|headlesschrome|phantomjs|scrapy|wget|libwww|httpclient|okhttp|node-fetch|postmanruntime|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|yandexbot|duckduckbot|applebot|uptimerobot|pingdom|gtmetrix|monitor/i;

export function classifyUserAgent(userAgent: string | null | undefined): UaClass {
  if (!userAgent || !userAgent.trim()) return "unknown";
  if (BOT_UA_PATTERN.test(userAgent)) return "bot";
  if (/mozilla/i.test(userAgent)) return "human";
  return "unknown";
}

export function sanitizeUserAgent(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

/** Lowercase snake_case, 1-64 chars -- deliberately looser than
 * lib/analytics/events.ts' compile-time FunnelEvent union (this is the
 * runtime HTTP boundary; never trust a request body just because our own
 * client code is the usual caller). */
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function sanitizeEventName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  return EVENT_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/i;
const MAX_PROPERTY_KEYS = 10;
const MAX_PROPERTY_VALUE_LENGTH = 200;

/**
 * Flat, allow-list-shaped sanitizer for the jsonb `properties` payload:
 * only string/number/boolean scalar values survive, keys and values are
 * capped, and anything nested (objects, arrays) is dropped rather than
 * recursed into -- this is a low-cardinality event-property bag, not a
 * general-purpose JSON store, so there is no legitimate payload shape this
 * rejects.
 */
export function sanitizeTelemetryProperties(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_PROPERTY_KEYS) break;
    if (!PROPERTY_KEY_PATTERN.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
    const strValue = String(value).slice(0, MAX_PROPERTY_VALUE_LENGTH);
    if (!strValue) continue;
    out[key] = strValue;
    count += 1;
  }
  return out;
}
