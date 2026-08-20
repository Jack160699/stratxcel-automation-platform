/**
 * Safe Web Fetcher & Crawler for Website Intelligence Engine
 *
 * Provides:
 *   - SSRF-safe HTTP fetching
 *   - Response size caps (5MB max)
 *   - Timeout handling
 *   - robots.txt discovery and compliance checking
 *   - Sitemap URL discovery
 *   - Internal link discovery and crawl limits
 */

import { isSafeTargetUrl, validateRedirectTarget } from "./security.ts";

export interface FetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  html: string;
  durationMs: number;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  timeoutMs?: number;
  respectRobotsTxt?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Performs a safe, SSRF-guarded HTTP request.
 */
export async function safeFetchHtml(
  targetUrl: string,
  options?: { timeoutMs?: number; maxRedirects?: number }
): Promise<FetchResult> {
  const safety = isSafeTargetUrl(targetUrl);
  if (!safety.safe) {
    throw new Error(`SSRF / Security check failed: ${safety.reason}`);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? 5;

  let currentUrl = targetUrl;
  let redirectCount = 0;
  const startTime = Date.now();

  while (redirectCount <= maxRedirects) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual", // Handle manually for strict SSRF redirect inspection
        headers: {
          "User-Agent": "Stratxcel-Intelligence-Bot/1.0 (+https://www.stratxcel.in/bot)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      clearTimeout(timeoutId);

      // Handle 3xx redirects safely
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect HTTP ${response.status} returned without Location header`);
        }

        const redirectCheck = validateRedirectTarget(currentUrl, location);
        if (!redirectCheck.safe || !redirectCheck.normalizedUrl) {
          throw new Error(`Unsafe redirect blocked: ${redirectCheck.reason}`);
        }

        currentUrl = redirectCheck.normalizedUrl;
        redirectCount++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} fetching ${currentUrl}`);
      }

      // Check Content-Type
      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        throw new Error(`Unsupported Content-Type '${contentType}' (HTML required)`);
      }

      // Enforce max body size
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error(`Response body exceeds max limit of ${MAX_RESPONSE_BYTES} bytes`);
      }

      const headersRecord: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headersRecord[key.toLowerCase()] = val;
      });

      return {
        url: targetUrl,
        finalUrl: currentUrl,
        statusCode: response.status,
        headers: headersRecord,
        html: text,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Fetch timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  throw new Error(`Max redirect limit (${maxRedirects}) exceeded`);
}

/**
 * Discovers and parses robots.txt to find disallowed paths and sitemap locations.
 */
export async function checkRobotsTxt(baseUrl: string): Promise<{
  allowed: boolean;
  sitemaps: string[];
  disallowedPaths: string[];
}> {
  try {
    const origin = new URL(baseUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const res = await safeFetchHtml(robotsUrl, { timeoutMs: 4000 });

    const sitemaps: string[] = [];
    const disallowedPaths: string[] = [];

    const lines = res.html.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^sitemap:\s*/i.test(trimmed)) {
        const sitemapUrl = trimmed.replace(/^sitemap:\s*/i, "").trim();
        if (sitemapUrl) sitemaps.push(sitemapUrl);
      } else if (/^disallow:\s*/i.test(trimmed)) {
        const path = trimmed.replace(/^disallow:\s*/i, "").trim();
        if (path) disallowedPaths.push(path);
      }
    }

    return { allowed: true, sitemaps, disallowedPaths };
  } catch {
    // If robots.txt does not exist or errors, default to allowed with no sitemaps
    return { allowed: true, sitemaps: [], disallowedPaths: [] };
  }
}
