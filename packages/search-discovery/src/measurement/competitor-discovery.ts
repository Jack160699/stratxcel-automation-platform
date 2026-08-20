import type { CompetitorProfile } from "./types.ts";
import type { ResearchResult } from "../research/types.ts";

/**
 * Canonicalizes a URL or raw domain string to a clean domain name.
 * e.g., "https://www.apollohospitals.com/services/cardio" -> "apollohospitals.com"
 */
export function canonicalizeDomain(raw: string): string {
  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) return "";

  // Remove protocol and trailing paths if plain string or URL
  cleaned = cleaned.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
  cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0].trim();
  return cleaned;
}

// Known generic directory, public aggregator, or search engine domains that should not be classified as direct single-business competitors
const NON_COMPETITOR_DOMAINS = new Set([
  "google.com",
  "google.co.in",
  "maps.google.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "justdial.com",
  "practo.com",
  "indiamart.com",
  "sulekha.com",
  "quikr.com",
  "wikipedia.org",
  "yelp.com",
]);

export function isDirectoryOrPlatformDomain(domain: string): boolean {
  const norm = domain.toLowerCase().replace(/^www\./, "");
  return NON_COMPETITOR_DOMAINS.has(norm);
}

export interface CompetitorDiscoveryInput {
  clientDomain: string;
  brandBrainCompetitors?: Array<{ name?: string; url?: string; domain?: string } | string>;
  groundedResearch?: ResearchResult | null;
  serpCompetitorItems?: Array<{ domain: string; title: string; url: string }>;
  existingProfiles?: CompetitorProfile[];
}

/**
 * Discovers and canonicalizes verified competitors from ground-truth sources.
 * Strictly avoids hallucinating competitors without evidence.
 */
export function discoverCompetitors(input: CompetitorDiscoveryInput): CompetitorProfile[] {
  const now = new Date().toISOString();
  const clientNorm = canonicalizeDomain(input.clientDomain);
  const competitorMap = new Map<string, CompetitorProfile>();

  // Ingest existing profiles if any
  if (input.existingProfiles) {
    for (const p of input.existingProfiles) {
      const d = canonicalizeDomain(p.domain);
      if (d && d !== clientNorm) {
        competitorMap.set(d, { ...p, domain: d });
      }
    }
  }

  // 1. Ingest Brand Brain Declared Competitors
  if (input.brandBrainCompetitors) {
    for (const comp of input.brandBrainCompetitors) {
      if (typeof comp === "string") {
        const d = canonicalizeDomain(comp);
        const name = comp.trim();
        if (d && d !== clientNorm && !isDirectoryOrPlatformDomain(d)) {
          competitorMap.set(d, {
            domain: d,
            businessName: name.length < 50 && !name.includes(".") ? name : d,
            source: "brand_brain",
            confidence: "HIGH",
            firstSeenAt: competitorMap.get(d)?.firstSeenAt ?? now,
            lastSeenAt: now,
          });
        } else if (name && !name.includes(".") && name.length < 50) {
          // If competitor name is provided without a domain
          const fallbackDomain = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
          if (!competitorMap.has(fallbackDomain)) {
            competitorMap.set(fallbackDomain, {
              domain: fallbackDomain,
              businessName: name,
              source: "brand_brain",
              confidence: "MEDIUM",
              firstSeenAt: competitorMap.get(fallbackDomain)?.firstSeenAt ?? now,
              lastSeenAt: now,
            });
          }
        }
      } else if (typeof comp === "object" && comp !== null) {
        const raw = comp.domain || comp.url || comp.name || "";
        const d = canonicalizeDomain(raw);
        const name = comp.name || d;
        if (d && d !== clientNorm && !isDirectoryOrPlatformDomain(d)) {
          competitorMap.set(d, {
            domain: d,
            businessName: name,
            source: "brand_brain",
            confidence: "HIGH",
            firstSeenAt: competitorMap.get(d)?.firstSeenAt ?? now,
            lastSeenAt: now,
          });
        }
      }
    }
  }

  // 2. Ingest Grounded Public Research Sources
  if (input.groundedResearch?.sources) {
    for (const src of input.groundedResearch.sources) {
      const d = canonicalizeDomain(src.domain || src.url);
      if (d && d !== clientNorm && !isDirectoryOrPlatformDomain(d)) {
        if (!competitorMap.has(d)) {
          competitorMap.set(d, {
            domain: d,
            businessName: src.title ? src.title.slice(0, 50) : d,
            source: "grounded_research",
            confidence: src.sourceType === "PRIMARY" ? "HIGH" : "MEDIUM",
            firstSeenAt: now,
            lastSeenAt: now,
          });
        }
      }
    }
  }

  // 3. Ingest SERP Top Competitors (organic search ranking peers)
  if (input.serpCompetitorItems) {
    for (const item of input.serpCompetitorItems) {
      const d = canonicalizeDomain(item.domain || item.url);
      if (d && d !== clientNorm && !isDirectoryOrPlatformDomain(d)) {
        const existing = competitorMap.get(d);
        if (!existing) {
          competitorMap.set(d, {
            domain: d,
            businessName: item.title ? item.title.split(/[-|–:]/)[0].trim() : d,
            source: "serp_measurement",
            confidence: "HIGH",
            firstSeenAt: now,
            lastSeenAt: now,
          });
        } else {
          existing.lastSeenAt = now;
        }
      }
    }
  }

  return Array.from(competitorMap.values());
}
