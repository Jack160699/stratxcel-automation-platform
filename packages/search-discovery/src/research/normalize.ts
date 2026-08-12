/**
 * Safe research URL normalization + SSRF-oriented rejection of unsafe schemes/hosts.
 * Reuses crawler private-IP checks where DNS resolution is available.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertPublicHttpTarget } from "../crawler.ts";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "_ga",
]);

const MAX_URL_LEN = 2048;

export class UnsafeResearchUrlError extends Error {
  readonly code = "unsafe_research_url";
  constructor(message: string) {
    super(message);
    this.name = "UnsafeResearchUrlError";
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const parts = ip.split(".").map(Number);
  return (
    parts.length === 4 &&
    (parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

export function isBlockedResearchScheme(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  return (
    lower.startsWith("file:") ||
    lower.startsWith("data:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("ftp:") ||
    lower.startsWith("blob:")
  );
}

/**
 * Normalize http(s) URLs for evidence identity:
 * lowercase host, strip fragment, drop common tracking params, preserve meaningful query.
 */
export function normalizeResearchUrl(raw: string): {
  url: string;
  canonicalUrl: string;
  domain: string;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new UnsafeResearchUrlError("url_required");
  }
  if (raw.length > MAX_URL_LEN) {
    throw new UnsafeResearchUrlError("url_too_long");
  }
  if (isBlockedResearchScheme(raw)) {
    throw new UnsafeResearchUrlError("unsafe_url_protocol");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new UnsafeResearchUrlError("invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeResearchUrlError("unsafe_url_protocol");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeResearchUrlError("unsafe_url_userinfo");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    isPrivateIp(host) ||
    (isIP(host) !== 0 && isPrivateIp(host))
  ) {
    throw new UnsafeResearchUrlError(`unsafe_private_host:${host}`);
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
    kept.append(key, value);
  }
  const query = kept.toString();
  parsed.search = query ? `?${query}` : "";

  const href = parsed.href;
  if (href.length > MAX_URL_LEN) {
    throw new UnsafeResearchUrlError("url_too_long");
  }

  return {
    url: href,
    canonicalUrl: href,
    domain: host,
  };
}

export async function assertResearchFetchTarget(
  raw: string,
  resolver: typeof lookup = lookup,
): Promise<URL> {
  const { url } = normalizeResearchUrl(raw);
  const parsed = new URL(url);
  await assertPublicHttpTarget(parsed, resolver);
  return parsed;
}

export function dedupeNormalizedSources<T extends { canonicalUrl: string }>(
  sources: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sources) {
    const key = s.canonicalUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
