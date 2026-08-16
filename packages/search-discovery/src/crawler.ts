import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { TechnicalPage } from "./types.ts";

export interface CrawlLimits {
  maxPages: number;
  maxDepth: number;
  requestTimeoutMs: number;
  totalTimeoutMs: number;
  maxRedirects: number;
  maxResponseBytes: number;
  concurrency: number;
}

export const HARD_CRAWL_CEILING = 500;
export const CRAWL_LIMITS = {
  free: 5,
  starter: 30,
  growth: 100,
  business: 250,
  scale: 400,
} as const;

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  maxPages: 30,
  maxDepth: 3,
  requestTimeoutMs: 8_000,
  totalTimeoutMs: 45_000,
  maxRedirects: 5,
  maxResponseBytes: 2_000_000,
  concurrency: 2,
};

export const BLOCKED_PATH = /\/(login|logout|signout|cart|checkout|session|admin|wp-admin|my-account)(\/|$)/i;

/**
 * Normalizes crawl URL by removing hashes, credentials, and non-essential tracking parameters.
 */
export function normalizeCrawlUrl(value: string, root?: URL): URL {
  const url = new URL(value, root);
  url.hash = "";
  url.username = "";
  url.password = "";
  // Strip common tracking parameters but keep path intact
  const searchParams = new URLSearchParams(url.search);
  for (const key of [...searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|msclkid|ref|source|_ga)/i.test(key)) {
      searchParams.delete(key);
    }
  }
  const cleanSearch = searchParams.toString();
  url.search = cleanSearch ? `?${cleanSearch}` : "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return url;
}

/**
 * Checks if an IP address is in a private, loopback, or link-local range.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.toLowerCase().trim();
  // IPv6 checks
  if (
    clean === "::1" ||
    clean === "::" ||
    clean.startsWith("fe80:") ||
    clean.startsWith("fc") ||
    clean.startsWith("fd")
  ) {
    return true;
  }
  // IPv4 checks
  const parts = clean.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !Number.isNaN(p) && p >= 0 && p <= 255)) {
    // 0.0.0.0/8 (broadcast/this network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (private)
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local / AWS metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (private)
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

/**
 * Strict SSRF protection: resolves hostname and ensures all addresses are public.
 */
export async function assertPublicHttpTarget(url: URL, resolver = lookup): Promise<void> {
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("CRAWL_TARGET_NOT_ALLOWED");
  }
  if (
    (url.protocol === "http:" && url.port && url.port !== "80") ||
    (url.protocol === "https:" && url.port && url.port !== "443")
  ) {
    throw new Error("CRAWL_TARGET_NOT_ALLOWED");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("CRAWL_PRIVATE_TARGET_BLOCKED");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("CRAWL_PRIVATE_TARGET_BLOCKED");
    return;
  }
  try {
    const addresses = await resolver(host, { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
      throw new Error("CRAWL_PRIVATE_TARGET_BLOCKED");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "CRAWL_PRIVATE_TARGET_BLOCKED") throw err;
    throw new Error("CRAWL_DNS_RESOLUTION_FAILED");
  }
}

function text(html: string, regex: RegExp): string | undefined {
  const match = regex.exec(html);
  return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Page priority classification for intelligent crawl ordering.
 * Lower number = higher priority to crawl first.
 */
export function getPagePriority(pathname: string): number {
  const p = pathname.toLowerCase();
  if (p === "/" || p === "") return 0;
  if (/^\/(about|company|who-we-are|services|solutions|offerings|products|locations|contact|pricing|plans|book|booking|menu|doctors|clinic)(\/|$)/.test(p)) {
    return 1;
  }
  if (/^\/(faq|reviews|testimonials|team|case-studies|portfolio|categories|store|shop)(\/|$)/.test(p)) {
    return 2;
  }
  if (/^\/(blog|articles|news|posts)(\/|$)/.test(p)) {
    return 3;
  }
  if (/^\/(privacy|terms|legal|cookie-policy)(\/|$)/.test(p)) {
    return 4;
  }
  return 2;
}

export interface ExtractedStructuredFact<T> {
  value: T;
  source: string;
  evidence: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  observed_at: string;
}

export interface StructuredPageData {
  technical: TechnicalPage;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  jsonLdObjects: Record<string, unknown>[];
  metaTags: Record<string, string>;
  contactSignals: {
    phones: string[];
    emails: string[];
    whatsapps: string[];
    forms: boolean;
    bookingLinks: string[];
  };
  techSignals: {
    isNextJs: boolean;
    isReact: boolean;
    isVue: boolean;
    isWordPress: boolean;
    isShopify: boolean;
    isWooCommerce: boolean;
    isWix: boolean;
    isSquarespace: boolean;
  };
  socialLinks: string[];
}

/**
 * Extracts comprehensive technical and semantic signals from a web page HTML.
 */
export function extractPageData(url: string, status: number, html: string): StructuredPageData {
  const canonical =
    text(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)/i) ??
    text(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical/i);
  const robots = text(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i);
  const title = text(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    text(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ??
    text(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);

  const links = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1].trim()).filter(Boolean);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imagesWithAlt = images.filter((tag) => /\balt=["'][^"']+["']/i.test(tag)).length;

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const h2s = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const h3s = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Parse JSON-LD
  const jsonLdObjects: Record<string, unknown>[] = [];
  const structuredDataTypes: string[] = [];
  const scriptBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of scriptBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry && typeof entry === "object") {
          jsonLdObjects.push(entry as Record<string, unknown>);
          const type = (entry as Record<string, unknown>)["@type"];
          if (typeof type === "string") structuredDataTypes.push(type);
          else if (Array.isArray(type)) structuredDataTypes.push(...type.filter((t): t is string => typeof t === "string"));
        }
      }
    } catch {
      structuredDataTypes.push("INVALID_JSON_LD");
    }
  }

  // Meta tags
  const metaTags: Record<string, string> = {};
  const metaMatches = [...html.matchAll(/<meta\b[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["']/gi)];
  for (const m of metaMatches) {
    metaTags[m[1].toLowerCase()] = m[2];
  }

  // Contact signals
  const phones = new Set<string>();
  const emails = new Set<string>();
  const whatsapps = new Set<string>();
  const bookingLinks = new Set<string>();
  const socialLinks = new Set<string>();

  for (const link of links) {
    if (link.startsWith("tel:")) {
      phones.add(link.replace("tel:", "").trim());
    } else if (link.startsWith("mailto:")) {
      emails.add(link.replace("mailto:", "").trim());
    } else if (/wa\.me\/|whatsapp\.com\/send|api\.whatsapp\.com/i.test(link)) {
      whatsapps.add(link);
    } else if (/calendly\.com|tidycal\.com|zcal\.co|book|appointment|schedule/i.test(link)) {
      bookingLinks.add(link);
    } else if (/instagram\.com|facebook\.com|fb\.com|threads\.net|linkedin\.com|youtube\.com|twitter\.com|x\.com|pinterest\.com|tiktok\.com/i.test(link)) {
      socialLinks.add(link);
    }
  }

  // Also extract text phone numbers & emails if not found in hrefs
  const textPhones = [...html.matchAll(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g)].map((m) => m[0]);
  for (const p of textPhones.slice(0, 3)) phones.add(p);
  const textEmails = [...html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map((m) => m[0]);
  for (const e of textEmails.slice(0, 3)) {
    if (!e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".svg")) emails.add(e);
  }

  // Tech framework detection
  const isNextJs = /__NEXT_DATA__|next\/router|_next\//i.test(html);
  const isReact = /data-reactroot|react-dom/i.test(html) || isNextJs;
  const isVue = /data-v-|__vue__/i.test(html) || /nuxt/i.test(html);
  const isWordPress = /wp-content|wp-includes|wp-json/i.test(html);
  const isShopify = /cdn\.shopify\.com|Shopify\.theme/i.test(html);
  const isWooCommerce = /woocommerce/i.test(html);
  const isWix = /wix\.com|wixsite\.com|wix-image/i.test(html);
  const isSquarespace = /squarespace\.com|static1\.squarespace/i.test(html);

  const hasForms = /<form\b/i.test(html);

  const technical: TechnicalPage = {
    url,
    status,
    indexable: status < 400 && !/noindex/i.test(robots ?? ""),
    robots,
    canonical,
    title,
    metaDescription,
    h1Count: h1s.length,
    imageCount: images.length,
    imagesWithAlt,
    structuredDataTypes,
    internalLinks: links,
  };

  return {
    technical,
    headings: { h1: h1s, h2: h2s, h3: h3s },
    jsonLdObjects,
    metaTags,
    contactSignals: {
      phones: [...phones],
      emails: [...emails],
      whatsapps: [...whatsapps],
      forms: hasForms,
      bookingLinks: [...bookingLinks],
    },
    techSignals: {
      isNextJs,
      isReact,
      isVue,
      isWordPress,
      isShopify,
      isWooCommerce,
      isWix,
      isSquarespace,
    },
    socialLinks: [...socialLinks],
  };
}

export function extractSeoPage(url: string, status: number, html: string): TechnicalPage {
  return extractPageData(url, status, html).technical;
}

export interface CanonicalCrawlResult {
  pages: TechnicalPage[];
  structuredPages: StructuredPageData[];
  errors: Array<{ url: string; error: string }>;
  truncated: boolean;
  robotsPresent: boolean;
  sitemapPresent: boolean;
  sitemapUrlsDiscovered: number;
}

/**
 * Extracts sitemap URLs recursively, resolving sitemap indexes.
 */
export async function parseSitemapXml(
  sitemapUrl: URL,
  fetcher: typeof fetch,
  options: { signal?: AbortSignal; resolver?: typeof lookup; maxDepth?: number } = {},
  currentDepth = 0,
): Promise<string[]> {
  if (currentDepth > 2) return [];
  try {
    await assertPublicHttpTarget(sitemapUrl, options.resolver);
    const res = await fetcher(sitemapUrl.href, {
      headers: { "User-Agent": "StratxcelSearchAudit/1.0 (+https://stratxcel.in/support)", Accept: "application/xml, text/xml, */*" },
      signal: options.signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls: string[] = [];

    // Check for sitemap index
    if (/<sitemapindex\b/i.test(xml)) {
      const childSitemaps = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gi)].map(
        (m) => m[1].trim(),
      );
      for (const childLoc of childSitemaps.slice(0, 5)) {
        try {
          const childUrl = normalizeCrawlUrl(childLoc, sitemapUrl);
          if (childUrl.origin === sitemapUrl.origin) {
            const nested = await parseSitemapXml(childUrl, fetcher, options, currentDepth + 1);
            urls.push(...nested);
          }
        } catch {
          // Ignore bad child sitemap loc
        }
      }
    } else {
      // Standard urlset
      const locs = [...xml.matchAll(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/url>/gi)].map((m) => m[1].trim());
      urls.push(...locs);
    }
    return urls;
  } catch {
    return [];
  }
}

/**
 * Single Canonical Business Intelligence Website Crawler.
 * Unifies search-discovery crawler and deep-scanner extraction into one high-performance,
 * SSRF-protected, budget-bounded crawling pipeline.
 */
export async function crawlWebsite(
  rootValue: string,
  options: {
    limits?: Partial<CrawlLimits>;
    fetcher?: typeof fetch;
    resolver?: typeof lookup;
    signal?: AbortSignal;
  } = {},
): Promise<CanonicalCrawlResult> {
  const root = normalizeCrawlUrl(rootValue);
  await assertPublicHttpTarget(root, options.resolver);

  const configured = { ...DEFAULT_CRAWL_LIMITS, ...options.limits };
  const limits: CrawlLimits = {
    ...configured,
    maxPages: Math.min(HARD_CRAWL_CEILING, Math.max(1, configured.maxPages)),
    concurrency: Math.min(4, Math.max(1, configured.concurrency)),
  };

  const fetcher = options.fetcher ?? fetch;
  const deadline = Date.now() + limits.totalTimeoutMs;
  const seen = new Set<string>();
  const pages: TechnicalPage[] = [];
  const structuredPages: StructuredPageData[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  let robotsPresent = false;
  let sitemapPresent = false;
  let sitemapUrlsDiscovered = 0;
  const disallowed: string[] = [];
  const discoveredSitemapUrls: string[] = [];

  // 1. Robots.txt discovery & parsing
  try {
    const robotsUrl = new URL("/robots.txt", root);
    const robotsResponse = await fetcher(robotsUrl.href, {
      redirect: "manual",
      headers: { "User-Agent": "StratxcelSearchAudit/1.0 (+https://stratxcel.in/support)" },
      signal: options.signal,
    });
    if (robotsResponse.ok) {
      const contentType = robotsResponse.headers.get("content-type") ?? "";
      const robotsText = (await robotsResponse.text()).slice(0, 200_000);
      // Ignore if server returned an HTML error page with 200 status
      if (!contentType.includes("html") && !/<html\b|<body\b/i.test(robotsText)) {
        robotsPresent = true;
        let relevant = false;
        for (const line of robotsText.split(/\r?\n/)) {
          const [rawKey, ...rest] = line.split(":");
          const key = rawKey?.trim().toLowerCase();
          const value = rest.join(":").trim();
          if (key === "user-agent") {
            relevant = value === "*" || /stratxcel/i.test(value);
          } else if (relevant && key === "disallow" && value && value.startsWith("/") && !/[<>"]/.test(value)) {
            disallowed.push(value);
          } else if (key === "sitemap" && value && !/[<>"]/.test(value)) {
            sitemapPresent = true;
            discoveredSitemapUrls.push(value);
          }
        }
      }
    }
  } catch {
    // robots unavailable is non-fatal
  }

  // 2. Sitemap XML discovery
  if (!discoveredSitemapUrls.length) {
    discoveredSitemapUrls.push(new URL("/sitemap.xml", root).href);
    discoveredSitemapUrls.push(new URL("/sitemap_index.xml", root).href);
  }

  const sitemapUrlsFromXml: string[] = [];
  for (const sUrl of discoveredSitemapUrls) {
    try {
      const parsed = new URL(sUrl, root);
      if (parsed.origin === root.origin) {
        const sitemapEntries = await parseSitemapXml(parsed, fetcher, {
          signal: options.signal,
          resolver: options.resolver,
        });
        if (sitemapEntries.length > 0) {
          sitemapPresent = true;
          sitemapUrlsFromXml.push(...sitemapEntries);
        }
      }
    } catch {
      // sitemap parse error is non-fatal
    }
  }
  sitemapUrlsDiscovered = sitemapUrlsFromXml.length;

  // 3. Initialize Priority Queue
  interface QueueItem {
    url: URL;
    depth: number;
    priority: number;
  }
  const queue: QueueItem[] = [{ url: root, depth: 0, priority: 0 }];

  // Add top sitemap URLs into the queue with priority
  for (const loc of sitemapUrlsFromXml.slice(0, 50)) {
    try {
      const u = normalizeCrawlUrl(loc, root);
      if (u.origin === root.origin && !seen.has(u.href)) {
        queue.push({ url: u, depth: 1, priority: getPagePriority(u.pathname) });
      }
    } catch {
      // ignore
    }
  }

  // Sort queue by priority ascending, then depth ascending
  function sortQueue() {
    queue.sort((a, b) => (a.priority === b.priority ? a.depth - b.depth : a.priority - b.priority));
  }

  // 4. Bounded Crawl Loop
  while (queue.length > 0 && pages.length < limits.maxPages && Date.now() < deadline) {
    sortQueue();
    const item = queue.shift()!;
    const normalized = normalizeCrawlUrl(item.url.href);

    if (
      seen.has(normalized.href) ||
      normalized.origin !== root.origin ||
      BLOCKED_PATH.test(normalized.pathname) ||
      disallowed.some((path) => path && normalized.pathname.startsWith(path))
    ) {
      continue;
    }
    seen.add(normalized.href);

    try {
      await assertPublicHttpTarget(normalized, options.resolver);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.requestTimeoutMs);
      const response = await fetcher(normalized.href, {
        redirect: "manual",
        headers: {
          "User-Agent": "StratxcelSearchAudit/1.0 (+https://stratxcel.in/support)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: options.signal ?? controller.signal,
      });
      clearTimeout(timer);

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("REDIRECT_WITHOUT_LOCATION");
        let next = normalizeCrawlUrl(location, normalized);

        for (let redirects = 0; redirects < limits.maxRedirects; redirects++) {
          if (next.origin !== root.origin) throw new Error("CROSS_ORIGIN_REDIRECT_BLOCKED");
          await assertPublicHttpTarget(next, options.resolver);
          const redirected = await fetcher(next.href, {
            redirect: "manual",
            headers: {
              "User-Agent": "StratxcelSearchAudit/1.0 (+https://stratxcel.in/support)",
              Accept: "text/html,application/xhtml+xml",
            },
            signal: options.signal,
          });

          if (!(redirected.status >= 300 && redirected.status < 400)) {
            const type = redirected.headers.get("content-type") ?? "";
            if (!type.includes("text/html")) throw new Error("NON_HTML_SKIPPED");
            const html = (await redirected.text()).slice(0, limits.maxResponseBytes);
            const data = extractPageData(next.href, redirected.status, html);
            pages.push(data.technical);
            structuredPages.push(data);
            break;
          }
          const target = redirected.headers.get("location");
          if (!target) throw new Error("REDIRECT_WITHOUT_LOCATION");
          next = normalizeCrawlUrl(target, next);
          if (redirects === limits.maxRedirects - 1) throw new Error("REDIRECT_LIMIT_EXCEEDED");
        }
        continue;
      }

      // Handle direct response
      const contentType = (response.headers?.get?.("content-type") ?? "").toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
        continue;
      }

      const length = Number(response.headers?.get?.("content-length") ?? 0);
      if (length > limits.maxResponseBytes) {
        throw new Error("RESPONSE_TOO_LARGE");
      }

      const html = (await response.text()).slice(0, limits.maxResponseBytes);
      if (html.length === 0) continue;

      const data = extractPageData(normalized.href, response.status, html);
      pages.push(data.technical);
      structuredPages.push(data);

      // Extract internal links for next depth
      if (item.depth < limits.maxDepth) {
        for (const link of data.technical.internalLinks ?? []) {
          try {
            const next = normalizeCrawlUrl(link, normalized);
            if (next.origin === root.origin && !seen.has(next.href) && !BLOCKED_PATH.test(next.pathname)) {
              queue.push({ url: next, depth: item.depth + 1, priority: getPagePriority(next.pathname) });
            }
          } catch {
            // malformed link ignored
          }
        }
      }
    } catch (error) {
      errors.push({
        url: normalized.href,
        error: error instanceof Error ? error.message : "CRAWL_FAILED",
      });
    }
  }

  return {
    pages,
    structuredPages,
    errors,
    truncated: queue.length > 0 || Date.now() >= deadline,
    robotsPresent,
    sitemapPresent,
    sitemapUrlsDiscovered,
  };
}
