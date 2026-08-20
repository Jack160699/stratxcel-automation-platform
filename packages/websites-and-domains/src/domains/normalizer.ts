/**
 * Safe Domain Input Validator & Normalizer
 *
 * Normalizes customer domain input:
 *   - "mybrand.com" -> "mybrand.com" (apex)
 *   - "www.mybrand.com" -> "www.mybrand.com" (www subdomain)
 *   - "https://MyBrand.com/" -> "mybrand.com"
 *
 * Enforces strict security & validation rules:
 *   - Rejects URLs with paths (e.g. "mybrand.com/shop")
 *   - Rejects query strings / hashes ("mybrand.com?utm=1")
 *   - Rejects IP addresses (IPv4, IPv6, loopback, cloud metadata 169.254.169.254)
 *   - Rejects local/internal hostnames (localhost, .local, .internal, .lan)
 *   - Rejects control chars, path traversals, SSRF payloads
 *   - Rejects invalid label formatting (leading/trailing hyphens, empty labels)
 */

import type { DomainNormalizationResult } from "./types.ts";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "instance-data",
  "local",
  "broadcasthost",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".localdomain",
  ".home.arpa",
  ".test",
  ".example",
  ".invalid",
];

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

/**
 * Normalizes and validates a domain name.
 */
export function normalizeDomainInput(rawInput: unknown): DomainNormalizationResult {
  if (!rawInput || typeof rawInput !== "string") {
    return { valid: false, error: "Please enter a valid domain name" };
  }

  let cleaned = rawInput.trim();

  // 1. Strip protocol if user pasted a full URL
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      // If path exists and is not just "/"
      if (parsed.pathname && parsed.pathname !== "/") {
        return {
          valid: false,
          error: "Please enter only your domain name (without path or page URLs, e.g. mybrand.com)",
        };
      }
      if (parsed.search || parsed.hash) {
        return {
          valid: false,
          error: "Please enter only your domain name (without query parameters or bookmarks)",
        };
      }
      if (parsed.port) {
        return {
          valid: false,
          error: "Ports (e.g. :8080) are not permitted in domain names",
        };
      }
      cleaned = parsed.hostname;
    } catch {
      return { valid: false, error: "Invalid URL or domain format" };
    }
  }

  // 2. Reject if paths or query params exist in naked input
  if (cleaned.includes("/") || cleaned.includes("\\")) {
    return {
      valid: false,
      error: "Please enter only your domain name without slashes or subpages (e.g. mybrand.com)",
    };
  }

  if (cleaned.includes("?") || cleaned.includes("#") || cleaned.includes("@") || cleaned.includes(":")) {
    return {
      valid: false,
      error: "Domain contains invalid characters (?, #, @, or :). Please enter e.g. mybrand.com",
    };
  }

  // Convert to lowercase and trim trailing dot if any
  cleaned = cleaned.toLowerCase().replace(/\.+$/, "");

  // 3. Length checks
  if (cleaned.length === 0 || cleaned.length > 253) {
    return {
      valid: false,
      error: "Domain name must be between 1 and 253 characters in length",
    };
  }

  // 4. IP address rejection
  if (IPV4_REGEX.test(cleaned) || IPV6_REGEX.test(cleaned) || cleaned.startsWith("[") || cleaned.endsWith("]")) {
    return {
      valid: false,
      error: "IP addresses cannot be used as custom domains. Please enter a named domain (e.g. mybrand.com)",
    };
  }

  // 5. Hostname & blocked suffixes checks
  if (BLOCKED_HOSTNAMES.has(cleaned)) {
    return {
      valid: false,
      error: "Localhost and internal hostnames cannot be used in production",
    };
  }

  for (const suffix of BLOCKED_SUFFIXES) {
    if (cleaned.endsWith(suffix) || cleaned === suffix.replace(/^\./, "")) {
      return {
        valid: false,
        error: `Domains ending in '${suffix}' are reserved for internal testing and cannot be connected`,
      };
    }
  }

  // 6. Label validation
  const labels = cleaned.split(".");
  if (labels.length < 2) {
    return {
      valid: false,
      error: "Domain must include an extension (e.g. .com, .in, .store, .co)",
    };
  }

  const labelRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label.length === 0) {
      return { valid: false, error: "Domain cannot contain empty labels or consecutive dots" };
    }
    if (label.length > 63) {
      return { valid: false, error: `Domain label '${label.slice(0, 10)}...' exceeds the maximum length of 63 characters` };
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return { valid: false, error: `Domain label '${label}' cannot begin or end with a hyphen` };
    }
    if (!labelRegex.test(label)) {
      return {
        valid: false,
        error: `Domain label '${label}' contains invalid characters. Use only letters, numbers, and hyphens`,
      };
    }
  }

  // 7. TLD check (last label)
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld)) {
    return {
      valid: false,
      error: "The top-level domain extension cannot be purely numeric",
    };
  }
  if (tld.length < 2) {
    return {
      valid: false,
      error: "The domain extension must be at least 2 characters (e.g. .in, .com, .io)",
    };
  }

  // 8. Derive apex domain and apex status
  const isApex = labels.length === 2 || (labels.length === 3 && isSecondLevelTld(labels[labels.length - 2], tld));
  const apexDomain = deriveApexDomain(labels);

  return {
    valid: true,
    normalized: cleaned,
    domain: cleaned,
    apexDomain,
    isApex,
  };
}

/**
 * Common ccTLD second-level domains (e.g. co.in, org.uk, com.au)
 */
const SECOND_LEVEL_TLD_SUBDOMAINS = new Set([
  "co", "com", "org", "net", "edu", "gov", "ac", "gen", "firm", "ind"
]);

function isSecondLevelTld(secondToLast: string, tld: string): boolean {
  // If ccTLD is 2 chars (e.g. in, uk, au, nz, za, br) and second-to-last is known SLD
  return tld.length === 2 && SECOND_LEVEL_TLD_SUBDOMAINS.has(secondToLast);
}

function deriveApexDomain(labels: string[]): string {
  if (labels.length <= 2) {
    return labels.join(".");
  }

  const tld = labels[labels.length - 1];
  const secondToLast = labels[labels.length - 2];

  if (isSecondLevelTld(secondToLast, tld)) {
    // Take 3 labels: brand.co.in
    return labels.slice(-3).join(".");
  }

  // Take 2 labels: brand.com
  return labels.slice(-2).join(".");
}
