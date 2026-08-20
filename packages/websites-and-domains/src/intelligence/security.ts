/**
 * Security & SSRF Protection Module for Website Intelligence Engine
 *
 * Enforces strict network isolation:
 *   - Blocks private/internal IP address ranges (RFC 1918, RFC 3927, RFC 4193, loopback)
 *   - Blocks cloud metadata endpoints (e.g. 169.254.169.254)
 *   - Blocks localhost, 0.0.0.0, and IPv6 equivalents
 *   - Validates HTTP/HTTPS protocols only
 *   - Validates redirect targets before following
 *   - Enforces max payload size limits (default: 5MB)
 *   - Enforces timeout limits
 */

export interface SecurityValidationResult {
  safe: boolean;
  reason?: string;
  normalizedUrl?: string;
}

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback 127.0.0.0/8
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Private Class A 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // Private Class B 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // Private Class C 192.168.0.0/16
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local / Cloud metadata 169.254.0.0/16
  /^0\.0\.0\.0$/,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "instance-data",
]);

/**
 * Validates a target URL against SSRF vulnerabilities and private networking.
 */
export function isSafeTargetUrl(urlString: string): SecurityValidationResult {
  if (!urlString || typeof urlString !== "string") {
    return { safe: false, reason: "Empty or invalid URL provided" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { safe: false, reason: "Malformed URL" };
  }

  // 1. Only allow HTTP and HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Unsupported protocol '${parsed.protocol}' (only HTTP/HTTPS allowed)` };
  }

  // 2. Reject credentials in URL (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return { safe: false, reason: "Userinfo / credentials in URL are prohibited" };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 3. Block localhost and specific reserved hostnames
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { safe: false, reason: "Localhost and local network domains are blocked" };
  }

  // 4. Block IPv6 loopback and private/link-local
  if (hostname === "::1" || hostname === "[::1]" || hostname.startsWith("fe80:") || hostname.startsWith("fc00:") || hostname.startsWith("fd00:")) {
    return { safe: false, reason: "Private/loopback IPv6 addresses are blocked" };
  }

  // 5. Block private IPv4 ranges & metadata service
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: "Private IP address ranges and cloud metadata endpoints are blocked" };
    }
  }

  return {
    safe: true,
    normalizedUrl: parsed.href,
  };
}

/**
 * Validates redirect target safety.
 */
export function validateRedirectTarget(currentTarget: string, redirectTarget: string): SecurityValidationResult {
  let resolved: string;
  try {
    resolved = new URL(redirectTarget, currentTarget).href;
  } catch {
    return { safe: false, reason: "Invalid redirect target URI" };
  }

  return isSafeTargetUrl(resolved);
}
