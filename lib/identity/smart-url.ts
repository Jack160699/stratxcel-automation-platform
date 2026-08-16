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
  displayName?: string;
  previewUrl?: string;
  isConfirmed?: boolean;
  isCustom?: boolean;
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
 * Tolerates leading/trailing whitespace, missing protocols, www, mobile/copied strings.
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

  // Remove common leading prefixes or copy artefacts
  trimmed = trimmed.replace(/^(url:\s*|website:\s*|link:\s*)/i, "").trim();

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
  if (/google\.[a-z.]+\/maps|g\.page|maps\.app\.goo\.gl|goo\.gl\/maps|business\.google\.com/i.test(s)) return "google_business";
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
      // Inputs:
      // - https://maps.app.goo.gl/xyz
      // - https://goo.gl/maps/xyz
      // - https://www.google.com/maps/place/Business+Name/@lat,lng,zoom
      // - https://g.page/r/xyz
      // - https://business.google.com/xyz
      // - embed maps iframe url
      const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        const parsed = new URL(withProto);
        let placeName: string | undefined;

        if (parsed.pathname.includes("/maps/place/")) {
          const placePart = parsed.pathname.split("/maps/place/")[1]?.split("/")[0];
          if (placePart) {
            placeName = decodeURIComponent(placePart.replace(/\+/g, " "));
          }
        } else if (parsed.pathname.startsWith("/maps/search/")) {
          const searchPart = parsed.pathname.split("/maps/search/")[1]?.split("/")[0];
          if (searchPart) {
            placeName = decodeURIComponent(searchPart.replace(/\+/g, " "));
          }
        } else if (parsed.hostname.includes("g.page")) {
          placeName = parsed.pathname.replace(/^\/r\/|^\//, "").split(/[/?#]/)[0];
        }

        const displayHandle = placeName ? placeName : parsed.hostname;
        return {
          ok: true,
          platform: "google_business",
          rawInput: raw,
          canonicalUrl: parsed.href,
          displayHandle,
          displayName: placeName,
        };
      } catch {
        return { ok: false, platform, rawInput: raw, error: "Invalid Google Maps / Business link" };
      }
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
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const discovered: DiscoveredSocialLink[] = [];
  const seenUrls = new Set<string>();

  let match: RegExpExecArray | null;

  // Extract from <a> tags
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1]?.trim();
    if (!rawHref || !isSafeProtocol(rawHref)) continue;

    const detected = detectPlatformFromInput(rawHref);
    if (detected === "website") continue;

    const norm = normalizePlatformInput(detected, rawHref);
    if (norm.ok && norm.canonicalUrl && !seenUrls.has(norm.canonicalUrl)) {
      seenUrls.add(norm.canonicalUrl);
      discovered.push({
        platform: detected,
        url: norm.canonicalUrl,
        handle: norm.displayHandle || norm.canonicalUrl,
        displayName: norm.displayName,
        rawHref,
      });
    }
  }

  // Extract Google Maps embed iframes
  while ((match = iframeRegex.exec(html)) !== null) {
    const rawSrc = match[1]?.trim();
    if (!rawSrc || !isSafeProtocol(rawSrc)) continue;
    if (/google\.[a-z.]+\/maps\/embed/i.test(rawSrc)) {
      const norm = normalizePlatformInput("google_business", rawSrc);
      if (norm.ok && norm.canonicalUrl && !seenUrls.has(norm.canonicalUrl)) {
        seenUrls.add(norm.canonicalUrl);
        discovered.push({
          platform: "google_business",
          url: norm.canonicalUrl,
          handle: norm.displayHandle || "Google Maps Listing",
          displayName: norm.displayName || "Google Maps Location",
          rawHref: rawSrc,
        });
      }
    }
  }

  return discovered;
}

