/**
 * Fail-closed public HTTP(S) URL guard for workforce READ/audit capabilities.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIpv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const parts = m.slice(1).map((p) => Number(p));
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export class UnsafePublicUrlError extends Error {
  readonly code = "unsafe_public_url";
  constructor(message: string) {
    super(message);
    this.name = "UnsafePublicUrlError";
  }
}

export function assertSafePublicHttpUrl(raw: string, fieldName = "url"): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new UnsafePublicUrlError(`${fieldName}_required`);
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafePublicUrlError(`invalid_${fieldName}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafePublicUrlError("unsafe_url_protocol");
  }
  if (url.username || url.password) {
    throw new UnsafePublicUrlError("unsafe_url_userinfo");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafePublicUrlError(`unsafe private url host: ${host}`);
  }
  if (isPrivateIpv4(host)) {
    throw new UnsafePublicUrlError(`unsafe private url host: ${host}`);
  }
  return url.href;
}
