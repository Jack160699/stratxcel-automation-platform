import { assertSafePublicHttpUrl } from "./url.ts";

/**
 * Real, independent website hosting/build-platform detection (STRATXCEL
 * PRODUCTION REPAIR mission, Section 16). Distinct from
 * app/api/platform/search/website/status/route.ts's `detectedPlatform`,
 * which only ever reports a Vercel project's own `framework` field AFTER a
 * customer has already connected Vercel -- that can never detect a site
 * hosted anywhere else. This module makes one safe, timeout-bounded,
 * SSRF-protected fetch and inspects response headers + a capped slice of
 * HTML for well-known, publicly documented hosting signatures. Never
 * claims a platform it isn't confident about -- an unmatched site reports
 * "unknown" with confidence "none", not a guess. Deliberately does NOT
 * include a rule for every platform named in the mission brief (e.g.
 * "Emergent") where no verifiable public signature is known to this
 * codebase -- inventing one risks a false positive, which is worse than
 * reporting "unknown"; the rule set below is intentionally extensible
 * (append one entry) once a real signature is confirmed.
 */

export type DetectedWebsitePlatform =
  | "vercel"
  | "netlify"
  | "wordpress"
  | "shopify"
  | "wix"
  | "webflow"
  | "squarespace"
  | "framer"
  | "github_pages"
  | "unknown";

export type PlatformDetectionConfidence = "high" | "medium" | "low" | "none";

export interface PlatformDetectionResult {
  platform: DetectedWebsitePlatform;
  confidence: PlatformDetectionConfidence;
  detectionSource: string[];
  checkedAt: string;
  error?: string;
}

const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_CHARS = 200_000;

interface HeaderRule {
  platform: DetectedWebsitePlatform;
  header: string;
  test: (value: string) => boolean;
  confidence: "high" | "medium";
  source: string;
}

const HEADER_RULES: HeaderRule[] = [
  { platform: "vercel", header: "x-vercel-id", test: () => true, confidence: "high", source: "header:x-vercel-id" },
  { platform: "vercel", header: "server", test: (v) => /vercel/i.test(v), confidence: "high", source: "header:server=Vercel" },
  { platform: "netlify", header: "x-nf-request-id", test: () => true, confidence: "high", source: "header:x-nf-request-id" },
  { platform: "netlify", header: "server", test: (v) => /netlify/i.test(v), confidence: "high", source: "header:server=Netlify" },
  { platform: "shopify", header: "x-shopify-stage", test: () => true, confidence: "high", source: "header:x-shopify-stage" },
  { platform: "shopify", header: "x-shardid", test: () => true, confidence: "medium", source: "header:x-shardid" },
  { platform: "wix", header: "x-wix-request-id", test: () => true, confidence: "high", source: "header:x-wix-request-id" },
  { platform: "github_pages", header: "server", test: (v) => /github\.com/i.test(v), confidence: "high", source: "header:server=GitHub.com" },
];

interface HtmlRule {
  platform: DetectedWebsitePlatform;
  pattern: RegExp;
  confidence: "high" | "medium";
  source: string;
}

const HTML_RULES: HtmlRule[] = [
  { platform: "wordpress", pattern: /wp-content\/|wp-includes\//i, confidence: "medium", source: "html:wp-content" },
  { platform: "wordpress", pattern: /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i, confidence: "high", source: "html:meta-generator=WordPress" },
  { platform: "shopify", pattern: /cdn\.shopify\.com/i, confidence: "medium", source: "html:cdn.shopify.com" },
  { platform: "wix", pattern: /static\.wixstatic\.com|parastorage\.com/i, confidence: "medium", source: "html:wixstatic" },
  { platform: "webflow", pattern: /assets-global\.website-files\.com|assets\.website-files\.com/i, confidence: "medium", source: "html:website-files.com" },
  { platform: "webflow", pattern: /<meta[^>]+name=["']generator["'][^>]+content=["']Webflow/i, confidence: "high", source: "html:meta-generator=Webflow" },
  { platform: "squarespace", pattern: /static1\.squarespace\.com/i, confidence: "medium", source: "html:squarespace.com" },
  { platform: "framer", pattern: /framerusercontent\.com/i, confidence: "medium", source: "html:framerusercontent.com" },
  { platform: "framer", pattern: /<meta[^>]+name=["']generator["'][^>]+content=["']Framer/i, confidence: "high", source: "html:meta-generator=Framer" },
];

const CONFIDENCE_RANK: Record<PlatformDetectionConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 };

/**
 * Real detection: one safe HEAD-then-GET against the customer's own URL
 * (never a third party's), same SSRF/DNS protection as the rest of the
 * onboarding source-verification pipeline (assertSafePublicHttpUrl, shared
 * with runSmartWebsiteDiscovery). Never throws on a reachability failure --
 * returns platform:"unknown" with the failure reason in `error`, since
 * detection failing must never block the customer (mission Section 18).
 */
export async function detectWebsitePlatform(
  rawUrl: string,
  options?: { fetcher?: typeof fetch }
): Promise<PlatformDetectionResult> {
  const checkedAt = new Date().toISOString();
  const fetcher = options?.fetcher ?? fetch;

  let safeUrl: URL;
  try {
    safeUrl = await assertSafePublicHttpUrl(rawUrl);
  } catch (err) {
    return {
      platform: "unknown",
      confidence: "none",
      detectionSource: [],
      checkedAt,
      error: err instanceof Error ? err.message : "Could not safely resolve this website.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let headers: Headers | null = null;
  let html = "";
  try {
    const res = await fetcher(safeUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "User-Agent": "StratxcelPlatformDetection/1.0 (+https://www.stratxcel.in)",
      },
    });
    headers = res.headers;
    const text = await res.text().catch(() => "");
    html = text.slice(0, MAX_HTML_CHARS);
  } catch (err) {
    return {
      platform: "unknown",
      confidence: "none",
      detectionSource: [],
      checkedAt,
      error: err instanceof Error ? err.message : "Website did not respond in time.",
    };
  } finally {
    clearTimeout(timer);
  }

  let best: { platform: DetectedWebsitePlatform; confidence: PlatformDetectionConfidence } = { platform: "unknown", confidence: "none" };
  const sources: string[] = [];

  if (headers) {
    for (const rule of HEADER_RULES) {
      const value = headers.get(rule.header);
      if (value && rule.test(value)) {
        sources.push(rule.source);
        if (CONFIDENCE_RANK[rule.confidence] > CONFIDENCE_RANK[best.confidence]) {
          best = { platform: rule.platform, confidence: rule.confidence };
        }
      }
    }
  }

  for (const rule of HTML_RULES) {
    if (rule.pattern.test(html)) {
      sources.push(rule.source);
      if (CONFIDENCE_RANK[rule.confidence] > CONFIDENCE_RANK[best.confidence]) {
        best = { platform: rule.platform, confidence: rule.confidence };
      }
    }
  }

  return { platform: best.platform, confidence: best.confidence, detectionSource: sources, checkedAt };
}
