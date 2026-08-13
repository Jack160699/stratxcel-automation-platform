import type { ResearchResult } from "@stratxcel/search-discovery";

type DiscoveryPage = {
  url?: string;
  title?: string;
  status?: number;
};

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "website";
  } catch {
    return "website";
  }
}

function decodeTitle(title: string | undefined, fallback: string): string {
  if (!title?.trim()) return fallback;
  return title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/**
 * First-party website pages discovered during Audit onboarding must become
 * grounded research evidence. External search may return zero sources even
 * when the business website was successfully crawled.
 */
export function mergeFirstPartyDiscoverySources(
  research: ResearchResult,
  input: {
    websiteUrl?: string | null;
    businessName: string;
    pages?: DiscoveryPage[];
    retrievedAt?: string;
  },
): ResearchResult {
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const seen = new Set(research.sources.map((source) => normalizeUrl(source.url)));
  const extras: ResearchResult["sources"][number][] = [];

  const pages = (input.pages ?? []).filter((page) => {
    if (typeof page.url !== "string" || !page.url.startsWith("http")) return false;
    const status = page.status ?? 200;
    return status >= 200 && status < 400;
  });

  for (const page of pages) {
    const url = page.url!;
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({
      id: `first_party_${extras.length + 1}`,
      url,
      canonicalUrl: url,
      title: decodeTitle(page.title, `${input.businessName} public page`),
      domain: domainOf(url),
      provider: "crawler",
      retrievedAt,
      searchQueries: [input.websiteUrl || url],
      sourceType: "PRIMARY",
      verification: "verified",
    });
  }

  if (input.websiteUrl && input.websiteUrl.startsWith("http") && !seen.has(normalizeUrl(input.websiteUrl))) {
    extras.unshift({
      id: "first_party_website",
      url: input.websiteUrl,
      canonicalUrl: input.websiteUrl,
      title: `${input.businessName} website`,
      domain: domainOf(input.websiteUrl),
      provider: "crawler",
      retrievedAt,
      searchQueries: [input.websiteUrl],
      sourceType: "PRIMARY",
      verification: "verified",
    });
  }

  if (extras.length === 0) return research;
  return {
    ...research,
    sources: [...extras, ...research.sources],
    evidenceArtifactIds: [...extras.map((source) => source.id), ...research.evidenceArtifactIds],
    summaryArtifactId: research.summaryArtifactId ?? "summary_research",
  };
}
