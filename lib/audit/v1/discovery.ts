import { lookup } from "node:dns/promises";
import { crawlWebsite, DEFAULT_CRAWL_LIMITS } from "@stratxcel/search-discovery";
import { field, pickHighestTruth, type ProvenanceField, type SourceClass } from "./provenance.ts";
import type { DiscoveredBusinessProfile } from "./adaptive-questions.ts";
import { assertSafePublicHttpUrl } from "./url.ts";

const DISCOVERY_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/services",
  "/products",
  "/pricing",
  "/contact",
  "/locations",
  "/faq",
];

export interface DiscoveryEvidenceItem {
  id: string;
  field: string;
  value: string;
  sourceClass: SourceClass;
  sourceUrl?: string;
}

export interface BusinessDiscoveryPacket {
  websiteUrl: string;
  profile: DiscoveredBusinessProfile;
  evidence: DiscoveryEvidenceItem[];
  pagesFetched: Array<{ url: string; title?: string; status: number }>;
  coverage: Record<string, boolean>;
  truncated: boolean;
}

function text(html: string, regex: RegExp): string | undefined {
  const match = regex.exec(html);
  return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block[1] ?? "{}");
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) out.push(entry as Record<string, unknown>);
      }
    } catch {
      /* invalid JSON-LD is ignored, never invented */
    }
  }
  return out;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 400);
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim().slice(0, 400) : undefined;
  }
  return undefined;
}

function addField(
  profile: DiscoveredBusinessProfile,
  key: keyof DiscoveredBusinessProfile,
  value: string | string[] | undefined,
  sourceClass: SourceClass,
  sourceUrl: string,
  evidence: DiscoveryEvidenceItem[],
) {
  if (value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0)) return;
  if (key === "websiteUrl") {
    profile.websiteUrl = typeof value === "string" ? value : profile.websiteUrl;
    return;
  }
  const incoming = field(value as never, sourceClass, sourceUrl);
  const current = profile[key] as ProvenanceField<never> | undefined;
  (profile as Record<string, unknown>)[key] = pickHighestTruth(current, incoming);
  evidence.push({
    id: `disc_${evidence.length + 1}`,
    field: String(key),
    value: Array.isArray(value) ? value.join(", ") : String(value),
    sourceClass,
    sourceUrl,
  });
}

export async function discoverPublicBusiness(input: {
  websiteUrl: string;
  fetcher?: typeof fetch;
  resolver?: typeof lookup;
}): Promise<BusinessDiscoveryPacket> {
  const url = await assertSafePublicHttpUrl(input.websiteUrl, input.resolver);
  const crawl = await crawlWebsite(url.href, {
    fetcher: input.fetcher,
    resolver: input.resolver,
    limits: {
      ...DEFAULT_CRAWL_LIMITS,
      maxPages: 8,
      maxDepth: 1,
      totalTimeoutMs: 20_000,
      requestTimeoutMs: 6_000,
      maxRedirects: 4,
      maxResponseBytes: 750_000,
    },
  });

  const profile: DiscoveredBusinessProfile = { websiteUrl: url.href };
  const evidence: DiscoveryEvidenceItem[] = [];
  const fetcher = input.fetcher ?? fetch;
  const seenPaths = new Set<string>();

  for (const path of DISCOVERY_PATHS) {
    const target = new URL(path, url);
    const key = target.href.replace(/\/$/, "");
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const response = await fetcher(target, {
        redirect: "manual",
        headers: { Accept: "text/html", "User-Agent": "StratxcelAuditDiscovery/1.0 (+https://stratxcel.in/support)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.status >= 300 && response.status < 400) continue;
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/html")) continue;
      const html = (await response.text()).slice(0, 750_000);
      if (!crawl.pages.some((page) => page.url.replace(/\/$/, "") === key)) {
        crawl.pages.push({
          url: target.href,
          status: response.status,
          title: text(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
          metaDescription: text(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i),
          indexable: true,
        });
      }
      extractFromHtml(html, target.href, profile, evidence);
    } catch {
      /* missing pages are not invented */
    }
  }

  for (const page of crawl.pages) {
    /* titles already extracted when we have html; crawl pages may only have SEO fields */
    if (page.title) addField(profile, "name", page.title.replace(/\s*[|\-–].*$/, "").trim(), "VERIFIED_PUBLIC", page.url, evidence);
    if (page.metaDescription) addField(profile, "positioning", page.metaDescription, "VERIFIED_PUBLIC", page.url, evidence);
  }

  const coverage = {
    website: crawl.pages.length > 0,
    google: false,
    instagram: Boolean(evidence.some((item) => /instagram/i.test(item.value))),
    facebook: Boolean(evidence.some((item) => /facebook/i.test(item.value))),
    reviews: false,
    analytics: false,
  };

  return {
    websiteUrl: url.href,
    profile,
    evidence: dedupeEvidence(evidence),
    pagesFetched: crawl.pages.map((page) => ({ url: page.url, title: page.title, status: page.status ?? 0 })),
    coverage,
    truncated: crawl.truncated,
  };
}

function extractFromHtml(
  html: string,
  sourceUrl: string,
  profile: DiscoveredBusinessProfile,
  evidence: DiscoveryEvidenceItem[],
) {
  addField(profile, "name", text(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i), "VERIFIED_PUBLIC", sourceUrl, evidence);
  addField(profile, "name", text(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i), "VERIFIED_PUBLIC", sourceUrl, evidence);
  addField(profile, "positioning", text(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i), "VERIFIED_PUBLIC", sourceUrl, evidence);
  addField(profile, "offer", text(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i), "VERIFIED_PUBLIC", sourceUrl, evidence);

  const ld = parseJsonLd(html);
  for (const node of ld) {
    const type = String(node["@type"] ?? "");
    if (!/Organization|LocalBusiness|ProfessionalService|Store/i.test(type) && type) continue;
    addField(profile, "name", stringValue(node.name), "VERIFIED_PUBLIC", sourceUrl, evidence);
    addField(profile, "positioning", stringValue(node.description), "VERIFIED_PUBLIC", sourceUrl, evidence);
    addField(profile, "phone", stringValue(node.telephone), "VERIFIED_PUBLIC", sourceUrl, evidence);
    addField(profile, "email", stringValue(node.email), "VERIFIED_PUBLIC", sourceUrl, evidence);
    const address = node.address && typeof node.address === "object" ? node.address as Record<string, unknown> : {};
    const location = [stringValue(address.addressLocality), stringValue(address.addressRegion), stringValue(address.addressCountry)]
      .filter(Boolean)
      .join(", ");
    addField(profile, "location", location || undefined, "VERIFIED_PUBLIC", sourceUrl, evidence);
    const sameAs = Array.isArray(node.sameAs) ? node.sameAs.filter((item): item is string => typeof item === "string") : [];
    if (sameAs.length) {
      evidence.push({
        id: `disc_${evidence.length + 1}`,
        field: "sameAs",
        value: sameAs.slice(0, 8).join(", "),
        sourceClass: "VERIFIED_PUBLIC",
        sourceUrl,
      });
    }
  }
}

function dedupeEvidence(items: DiscoveryEvidenceItem[]): DiscoveryEvidenceItem[] {
  const seen = new Set<string>();
  const out: DiscoveryEvidenceItem[] = [];
  for (const item of items) {
    const key = `${item.field}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 80);
}
