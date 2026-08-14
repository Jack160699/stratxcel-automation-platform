/**
 * Smart URL Normalization & Provider Resolution Engine
 *
 * Universal normalizer for websites and social platforms across the platform.
 * Supports raw handles (@username), bare domains (example.com), full URLs,
 * mobile/share URLs, trailing slashes, and query parameters.
 * Hard-rejects unsafe schemes (javascript:, data:, file:, vbscript:).
 */

export type SupportedPlatform =
  | "website"
  | "instagram"
  | "facebook"
  | "threads"
  | "youtube"
  | "linkedin"
  | "x"
  | "whatsapp"
  | "google_business";

export interface NormalizedUrlResult {
  ok: boolean;
  platform: SupportedPlatform;
  rawInput: string;
  canonicalUrl?: string;
  displayHandle?: string;
  displayName?: string;
  error?: string;
}

export interface DiscoveredSocialLink {
  platform: SupportedPlatform;
  url: string;
  handle: string;
  rawHref: string;
}

const UNSAFE_PROTOCOL_REGEX = /^(javascript|data|file|vbscript|about|blob):/i;

/**
 * Sanitize and validate basic URL safety.
 */
export function isSafeProtocol(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (UNSAFE_PROTOCOL_REGEX.test(trimmed)) return false;
  return true;
}

/**
 * Normalize any website URL into a safe, canonical https:// (or http://) URL.
 */
export function normalizeWebsiteUrl(raw: string): { ok: boolean; url?: string; host?: string; error?: string } {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "Website URL is required" };
  }
  let trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Website URL cannot be empty" };

  if (!isSafeProtocol(trimmed)) {
    return { ok: false, error: "Unsafe URL scheme detected" };
  }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Only HTTP and HTTPS protocols are supported" };
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes(".") || host.endsWith(".")) {
      return { ok: false, error: "Please enter a valid domain name (e.g. yourbusiness.com)" };
    }
    // Clean trailing slashes unless path has something
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    const canonical = `${parsed.protocol}//${host}${pathname}${parsed.search}`;
    return { ok: true, url: canonical, host };
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }
}

/**
 * Intelligently detect which platform a URL or input belongs to.
 */
export function detectPlatformFromInput(input: string): SupportedPlatform {
  const s = input.toLowerCase().trim();
  if (/instagram\.com|instagr\.am/i.test(s)) return "instagram";
  if (/facebook\.com|fb\.com|fb\.me/i.test(s)) return "facebook";
  if (/threads\.net/i.test(s)) return "threads";
  if (/youtube\.com|youtu\.be/i.test(s)) return "youtube";
  if (/linkedin\.com/i.test(s)) return "linkedin";
  if (/twitter\.com|x\.com/i.test(s)) return "x";
  if (/wa\.me|api\.whatsapp\.com|whatsapp\.com/i.test(s)) return "whatsapp";
  if (/google\.com\/maps|g\.page|maps\.app\.goo\.gl|business\.google\.com/i.test(s)) return "google_business";
  return "website";
}

/**
 * Clean username from @, leading/trailing slashes, query params, etc.
 */
function cleanHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[?#].*$/, "")
    .trim();
}

/**
 * Normalize platform-specific handle or URL into a canonical profile representation.
 */
export function normalizePlatformInput(
  platform: SupportedPlatform,
  raw: string
): NormalizedUrlResult {
  if (!raw || typeof raw !== "string") {
    return { ok: false, platform, rawInput: raw ?? "", error: "Input is required" };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, platform, rawInput: raw, error: "Input cannot be empty" };

  if (!isSafeProtocol(trimmed)) {
    return { ok: false, platform, rawInput: raw, error: "Unsafe input protocol" };
  }

  // Handle specific platforms
  switch (platform) {
    case "website": {
      const res = normalizeWebsiteUrl(trimmed);
      if (!res.ok) return { ok: false, platform, rawInput: raw, error: res.error };
      return {
        ok: true,
        platform: "website",
        rawInput: raw,
        canonicalUrl: res.url,
        displayHandle: res.host,
      };
    }

    case "instagram": {
      // Inputs: @username, username, instagram.com/username, https://www.instagram.com/username/?hl=en
      let handle = "";
      if (trimmed.includes("instagram.com") || trimmed.includes("instagr.am")) {
        const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        const parts = withoutProto.split("/").filter(Boolean);
        handle = cleanHandle(parts[1] || parts[0] || "");
      } else {
        handle = cleanHandle(trimmed);
      }
      if (!handle || handle.length < 1) {
        return { ok: false, platform, rawInput: raw, error: "Invalid Instagram username" };
      }
      return {
        ok: true,
        platform: "instagram",
        rawInput: raw,
        canonicalUrl: `https://www.instagram.com/${handle}/`,
        displayHandle: `@${handle}`,
      };
    }

    case "facebook": {
      // Inputs: facebook.com/pagename, fb.com/pagename, pagename, https://facebook.com/pages/name/12345
      let handle = "";
      if (trimmed.includes("facebook.com") || trimmed.includes("fb.com") || trimmed.includes("fb.me")) {
        const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^m\./i, "");
        const pathPart = withoutProto.replace(/^facebook\.com\/?|^fb\.com\/?|^fb\.me\/?/i, "");
        handle = cleanHandle(pathPart);
      } else {
        handle = cleanHandle(trimmed);
      }
      if (!handle) {
        return { ok: false, platform, rawInput: raw, error: "Invalid Facebook page identifier" };
      }
      const canonicalUrl = handle.startsWith("pages/") || handle.startsWith("profile.php")
        ? `https://www.facebook.com/${handle}`
        : `https://www.facebook.com/${handle}/`;
      return {
        ok: true,
        platform: "facebook",
        rawInput: raw,
        canonicalUrl,
        displayHandle: handle.includes("/") ? handle : `@${handle}`,
      };
    }

    case "threads": {
      let handle = "";
      if (trimmed.includes("threads.net")) {
        const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        const parts = withoutProto.split("/").filter(Boolean);
        handle = cleanHandle(parts[1] || parts[0] || "");
      } else {
        handle = cleanHandle(trimmed);
      }
      if (!handle) return { ok: false, platform, rawInput: raw, error: "Invalid Threads handle" };
      return {
        ok: true,
        platform: "threads",
        rawInput: raw,
        canonicalUrl: `https://www.threads.net/@${handle}`,
        displayHandle: `@${handle}`,
      };
    }

    case "youtube": {
      let handle = "";
      if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
        const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        const pathPart = withoutProto.replace(/^youtube\.com\/?|^youtu\.be\/?/i, "");
        handle = cleanHandle(pathPart);
      } else {
        handle = cleanHandle(trimmed);
      }
      if (!handle) return { ok: false, platform, rawInput: raw, error: "Invalid YouTube channel or handle" };
      const canonicalUrl = handle.startsWith("@") || handle.startsWith("channel/") || handle.startsWith("c/") || handle.startsWith("user/")
        ? `https://www.youtube.com/${handle}`
        : `https://www.youtube.com/@${handle}`;
      return {
        ok: true,
        platform: "youtube",
        rawInput: raw,
        canonicalUrl,
        displayHandle: handle.startsWith("@") ? handle : `@${handle}`,
      };
    }

    case "linkedin": {
      let handle = "";
      if (trimmed.includes("linkedin.com")) {
        const withoutProto = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        const pathPart = withoutProto.replace(/^linkedin\.com\/?/i, "");
        handle = cleanHandle(pathPart);
      } else {
        handle = cleanHandle(trimmed);
      }
      if (!handle) return { ok: false, platform, rawInput: raw, error: "Invalid LinkedIn URL or handle" };
      const canonicalUrl = handle.startsWith("company/") || handle.startsWith("in/")
        ? `https://www.linkedin.com/${handle}`
        : `https://www.linkedin.com/company/${handle}`;
      return {
        ok: true,
        platform: "linkedin",
        rawInput: raw,
        canonicalUrl,
        displayHandle: handle,
      };
    }

    case "x": {
      let handle = cleanHandle(trimmed.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\/?/i, ""));
      if (!handle) return { ok: false, platform, rawInput: raw, error: "Invalid X/Twitter handle" };
      return {
        ok: true,
        platform: "x",
        rawInput: raw,
        canonicalUrl: `https://x.com/${handle}`,
        displayHandle: `@${handle}`,
      };
    }

    case "whatsapp": {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        return { ok: false, platform, rawInput: raw, error: "Invalid WhatsApp phone number (must be 10-15 digits)" };
      }
      return {
        ok: true,
        platform: "whatsapp",
        rawInput: raw,
        canonicalUrl: `https://wa.me/${digits}`,
        displayHandle: `+${digits}`,
      };
    }

    case "google_business": {
      const websiteNorm = normalizeWebsiteUrl(trimmed);
      if (!websiteNorm.ok) return { ok: false, platform, rawInput: raw, error: "Invalid Google Business link" };
      return {
        ok: true,
        platform: "google_business",
        rawInput: raw,
        canonicalUrl: websiteNorm.url,
        displayHandle: websiteNorm.host,
      };
    }

    default:
      return { ok: false, platform, rawInput: raw, error: "Unsupported platform" };
  }
}

/**
 * Extract all public social links from an HTML document.
 */
export function extractAllSocialLinksFromHtml(html: string): DiscoveredSocialLink[] {
  if (!html || typeof html !== "string") return [];

  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  const discovered: DiscoveredSocialLink[] = [];
  const seenUrls = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1]?.trim();
    if (!rawHref || !isSafeProtocol(rawHref)) continue;

    const detected = detectPlatformFromInput(rawHref);
    if (detected === "website" || detected === "google_business") continue;

    const norm = normalizePlatformInput(detected, rawHref);
    if (norm.ok && norm.canonicalUrl && !seenUrls.has(norm.canonicalUrl)) {
      seenUrls.add(norm.canonicalUrl);
      discovered.push({
        platform: detected,
        url: norm.canonicalUrl,
        handle: norm.displayHandle || norm.canonicalUrl,
        rawHref,
      });
    }
  }

  return discovered;
}
