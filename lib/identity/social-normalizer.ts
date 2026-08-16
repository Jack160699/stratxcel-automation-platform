/**
 * Social Platform Input Normalization & Validation Engine
 *
 * Normalizes user-entered handles, profile links, custom slugs, and phone numbers
 * for official social accounts (Instagram, Facebook, Threads, YouTube, LinkedIn, WhatsApp).
 */

export interface NormalizedSocialInput {
  platform: string;
  handle: string;
  url: string;
}

export function validateAndNormalizeSocialInput(
  platform: string,
  rawInput: string
): { success: true; data: NormalizedSocialInput } | { success: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { success: false, error: "Please enter a handle or profile URL." };
  }

  const p = platform.toLowerCase();

  if (p === "instagram") {
    const handleMatch = trimmed.match(/^(?:https?:\/\/(?:www\.)?instagram\.com\/)?@?([a-zA-Z0-9._]+)\/?(?:\?.*)?$/i);
    if (!handleMatch || !handleMatch[1]) {
      return { success: false, error: "Enter a valid Instagram username (e.g. @yourbrand or instagram.com/yourbrand)." };
    }
    const cleanHandle = handleMatch[1].replace(/^@/, "");
    return {
      success: true,
      data: {
        platform: "instagram",
        handle: `@${cleanHandle}`,
        url: `https://www.instagram.com/${cleanHandle}/`,
      },
    };
  }

  if (p === "facebook") {
    if (/facebook\.com/i.test(trimmed)) {
      try {
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.replace(/\/$/, "");
        const segments = pathname.split("/").filter(Boolean);
        const handle = segments[segments.length - 1] || "Facebook Page";
        return {
          success: true,
          data: {
            platform: "facebook",
            handle: handle.startsWith("@") ? handle : `@${handle}`,
            url: urlObj.href,
          },
        };
      } catch {
        return { success: false, error: "Enter a valid Facebook page URL." };
      }
    }
    const clean = trimmed.replace(/^@/, "").trim();
    if (clean.length < 2) {
      return { success: false, error: "Enter a valid Facebook page name or link." };
    }
    return {
      success: true,
      data: {
        platform: "facebook",
        handle: `@${clean}`,
        url: `https://www.facebook.com/${clean}`,
      },
    };
  }

  if (p === "threads") {
    const match = trimmed.match(/^(?:https?:\/\/(?:www\.)?threads\.net\/)?@?([a-zA-Z0-9._]+)\/?(?:\?.*)?$/i);
    if (!match || !match[1]) {
      return { success: false, error: "Enter a valid Threads username (e.g. @yourbrand or threads.net/@yourbrand)." };
    }
    const cleanHandle = match[1].replace(/^@/, "");
    return {
      success: true,
      data: {
        platform: "threads",
        handle: `@${cleanHandle}`,
        url: `https://www.threads.net/@${cleanHandle}`,
      },
    };
  }

  if (p === "youtube") {
    if (/youtube\.com|youtu\.be/i.test(trimmed)) {
      try {
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const atMatch = path.match(/@([a-zA-Z0-9._-]+)/);
        const handle = atMatch ? `@${atMatch[1]}` : path.split("/").filter(Boolean).pop() || "YouTube Channel";
        return {
          success: true,
          data: {
            platform: "youtube",
            handle,
            url: urlObj.href,
          },
        };
      } catch {
        return { success: false, error: "Enter a valid YouTube channel URL." };
      }
    }
    const clean = trimmed.replace(/^@/, "");
    if (!/^[a-zA-Z0-9._-]+$/.test(clean)) {
      return { success: false, error: "Enter a valid YouTube handle (e.g. @YourChannel or youtube.com/@YourChannel)." };
    }
    return {
      success: true,
      data: {
        platform: "youtube",
        handle: `@${clean}`,
        url: `https://www.youtube.com/@${clean}`,
      },
    };
  }

  if (p === "linkedin") {
    if (/linkedin\.com/i.test(trimmed)) {
      try {
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        const urlObj = new URL(url);
        const segs = urlObj.pathname.split("/").filter(Boolean);
        const handle = segs[segs.length - 1] || "LinkedIn Profile";
        return {
          success: true,
          data: {
            platform: "linkedin",
            handle,
            url: urlObj.href,
          },
        };
      } catch {
        return { success: false, error: "Enter a valid LinkedIn profile or company URL." };
      }
    }
    const clean = trimmed.replace(/^@/, "").trim();
    if (!clean) {
      return { success: false, error: "Enter a valid LinkedIn company or profile link." };
    }
    return {
      success: true,
      data: {
        platform: "linkedin",
        handle: clean,
        url: `https://www.linkedin.com/company/${clean}/`,
      },
    };
  }

  if (p === "whatsapp") {
    const digits = trimmed.replace(/[^0-9]/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return { success: false, error: "Enter a valid WhatsApp phone number with country code (e.g. +91 98765 43210)." };
    }
    return {
      success: true,
      data: {
        platform: "whatsapp",
        handle: `+${digits}`,
        url: `https://wa.me/${digits}`,
      },
    };
  }

  // Generic platform fallback
  let url = trimmed;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return {
      success: true,
      data: {
        platform: p,
        handle: parsed.hostname,
        url: parsed.href,
      },
    };
  } catch {
    return { success: false, error: "Enter a valid website link or profile." };
  }
}
