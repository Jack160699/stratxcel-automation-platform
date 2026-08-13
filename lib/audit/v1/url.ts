import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertPublicHttpTarget } from "@stratxcel/search-discovery";

const MAX_URL_LEN = 2048;
const BLOCKED_SCHEMES = /^(javascript|data|file|ftp|blob|about|chrome):/i;

export class UnsafeBusinessUrlError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UnsafeBusinessUrlError";
    this.code = code;
  }
}

/**
 * Accepts messy customer website input and returns a canonical http(s) URL.
 * Does not invent a business — only normalizes formatting.
 */
export function normalizeBusinessWebsiteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new UnsafeBusinessUrlError("url_required", "Enter a website or domain.");
  if (trimmed.length > MAX_URL_LEN) throw new UnsafeBusinessUrlError("url_too_long", "That website address is too long.");
  if (BLOCKED_SCHEMES.test(trimmed)) throw new UnsafeBusinessUrlError("unsafe_url_protocol", "Only http and https websites are allowed.");

  let candidate = trimmed.replace(/\s+/g, "");
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UnsafeBusinessUrlError("invalid_url", "Enter a website like yourbusiness.in");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UnsafeBusinessUrlError("unsafe_url_protocol", "Only http and https websites are allowed.");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname === "/") parsed.pathname = "";
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!parsed.hostname || parsed.hostname === "localhost") {
    throw new UnsafeBusinessUrlError("invalid_host", "Enter a public website.");
  }
  return parsed.toString().replace(/\/$/, "") || `${parsed.protocol}//${parsed.host}`;
}

export function normalizeChannelValue(type: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1).replace(/[^\w.]/g, "");
    if (type === "instagram") return `https://www.instagram.com/${handle}`;
    if (type === "x") return `https://x.com/${handle}`;
    if (type === "youtube") return `https://www.youtube.com/@${handle}`;
    if (type === "threads") return `https://www.threads.net/@${handle}`;
    if (type === "facebook") return `https://www.facebook.com/${handle}`;
    if (type === "linkedin") return `https://www.linkedin.com/in/${handle}`;
    return trimmed;
  }
  if (type === "whatsapp" && /^\+?\d[\d\s-]{7,}$/.test(trimmed)) {
    const digits = trimmed.replace(/[^\d]/g, "");
    return `https://wa.me/${digits}`;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && trimmed.includes(".")) {
    return normalizeBusinessWebsiteInput(trimmed);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.includes(".")) {
    return normalizeBusinessWebsiteInput(trimmed);
  }
  return trimmed;
}

export async function assertSafePublicHttpUrl(
  raw: string,
  resolver: typeof lookup = lookup,
): Promise<URL> {
  const canonical = normalizeBusinessWebsiteInput(raw);
  const url = new URL(canonical);
  if (isIP(url.hostname) && isPrivateLiteral(url.hostname)) {
    throw new UnsafeBusinessUrlError("private_target", "That address is not a public website.");
  }
  try {
    await assertPublicHttpTarget(url, resolver);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRAWL_TARGET_NOT_ALLOWED";
    if (message.includes("PRIVATE")) {
      throw new UnsafeBusinessUrlError("private_target", "That address is not a public website.");
    }
    throw new UnsafeBusinessUrlError("unsafe_target", "That website cannot be checked safely.");
  }
  return url;
}

function isPrivateLiteral(ip: string): boolean {
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
