import { createHash } from "node:crypto";
import type { TargetQuery, QueryClass } from "./types.ts";
import type { QueryMetric } from "../types.ts";

export interface QueryGenerationInput {
  businessName: string;
  services: string[];
  locations: string[];
  category?: string;
  brandBrainOffers?: string[];
  gscMetrics?: QueryMetric[];
  competitors?: string[];
  goals?: string[];
  maxQueries?: number;
}

function stableFingerprint(parts: string[]): string {
  return createHash("sha256")
    .update(parts.map((p) => p.trim().toLowerCase()).join("\u001f"))
    .digest("hex");
}

function classifyQuery(query: string, businessName: string, locations: string[]): {
  queryClass: QueryClass;
  intent: "commercial" | "transactional" | "local" | "informational" | "comparison" | "branded";
} {
  const q = query.toLowerCase();
  const biz = businessName.toLowerCase();

  if (q.includes(biz) || biz.includes(q)) {
    return { queryClass: "branded", intent: "branded" };
  }
  if (/vs|compare|alternative|better than/.test(q)) {
    return { queryClass: "comparison", intent: "comparison" };
  }
  const isLocal = /near me| in [a-z0-9\s]+| around /i.test(q) || locations.some((loc) => q.includes(loc.toLowerCase()));
  if (isLocal) {
    return { queryClass: "local", intent: "local" };
  }
  if (/best|top|rating|reviews|recommended/.test(q)) {
    return { queryClass: "commercial", intent: "commercial" };
  }
  if (/buy|book|hire|cost|price|appointment|charges/.test(q)) {
    return { queryClass: "high_intent", intent: "transactional" };
  }
  if (/how to|what is|why|guide|tips|process/.test(q)) {
    return { queryClass: "informational", intent: "informational" };
  }
  return { queryClass: "service", intent: "commercial" };
}

/**
 * Deterministically generates and prioritizes a bounded target search query set
 * based on verified business facts, GSC telemetry, and Brand Brain.
 */
export function generateTargetQuerySet(input: QueryGenerationInput): TargetQuery[] {
  const maxQueries = input.maxQueries ?? 25;
  const queryMap = new Map<string, TargetQuery>();

  // 1. Ingest verified Google Search Console queries (highest demand evidence)
  if (input.gscMetrics && input.gscMetrics.length > 0) {
    for (const m of input.gscMetrics) {
      const qClean = m.query.trim().toLowerCase();
      if (!qClean || qClean.length < 3) continue;

      const { queryClass, intent } = classifyQuery(qClean, input.businessName, input.locations);
      const isBranded = queryClass === "branded";
      const highTraffic = m.impressions >= 100 || m.clicks >= 5;

      // Higher business value for commercial, local, and transaction queries
      const businessValue = isBranded
        ? 65
        : intent === "transactional" || intent === "local"
        ? 95
        : intent === "commercial"
        ? 88
        : 70;

      const relevance = 90;
      const confidence = highTraffic ? "HIGH" as const : "MEDIUM" as const;

      const fingerprint = stableFingerprint([input.businessName, qClean]);
      queryMap.set(qClean, {
        fingerprint,
        query: m.query.trim(),
        queryClass,
        intent,
        businessValue,
        relevance,
        demandEvidence: {
          source: "gsc",
          impressions: m.impressions,
          clicks: m.clicks,
          description: `${m.impressions} impressions and ${m.clicks} clicks recorded in Search Console.`,
        },
        confidence,
      });
    }
  }

  // 2. Synthesize High-Intent Service & Local Queries from business knowledge
  const allServices = Array.from(new Set([...input.services, ...(input.brandBrainOffers || [])])).filter(Boolean);
  const primaryLocations = input.locations.filter(Boolean);

  for (const service of allServices) {
    const sClean = service.trim();
    if (!sClean) continue;

    // Direct service search
    const baseQuery = sClean.toLowerCase();
    if (!queryMap.has(baseQuery)) {
      const { queryClass, intent } = classifyQuery(baseQuery, input.businessName, input.locations);
      queryMap.set(baseQuery, {
        fingerprint: stableFingerprint([input.businessName, baseQuery]),
        query: sClean,
        queryClass,
        intent,
        businessValue: 85,
        relevance: 95,
        demandEvidence: {
          source: "business_service",
          description: "Primary service offering declared by business.",
        },
        confidence: "HIGH",
      });
    }

    // Commercial intent query ("best [service]")
    const bestQuery = `best ${baseQuery}`;
    if (!queryMap.has(bestQuery)) {
      queryMap.set(bestQuery, {
        fingerprint: stableFingerprint([input.businessName, bestQuery]),
        query: `Best ${sClean}`,
        queryClass: "commercial",
        intent: "commercial",
        businessValue: 90,
        relevance: 90,
        demandEvidence: {
          source: "business_service",
          description: "High commercial discovery query for core service offering.",
        },
        confidence: "HIGH",
      });
    }

    // Local geo-targeted queries for each primary location
    for (const loc of primaryLocations.slice(0, 3)) {
      const locClean = loc.trim();
      const localQuery = `${baseQuery} in ${locClean.toLowerCase()}`;
      if (!queryMap.has(localQuery)) {
        queryMap.set(localQuery, {
          fingerprint: stableFingerprint([input.businessName, localQuery]),
          query: `${sClean} in ${locClean}`,
          queryClass: "local",
          intent: "local",
          businessValue: 95,
          relevance: 95,
          targetLocation: locClean,
          demandEvidence: {
            source: "business_service",
            description: `Geo-targeted local service inquiry in ${locClean}.`,
          },
          confidence: "HIGH",
        });
      }
    }
  }

  // 3. Comparison Queries against known competitors
  if (input.competitors && input.competitors.length > 0) {
    for (const comp of input.competitors.slice(0, 3)) {
      const compClean = comp.trim();
      if (!compClean) continue;
      const compQuery = `${input.businessName.toLowerCase()} vs ${compClean.toLowerCase()}`;
      if (!queryMap.has(compQuery)) {
        queryMap.set(compQuery, {
          fingerprint: stableFingerprint([input.businessName, compQuery]),
          query: `${input.businessName} vs ${compClean}`,
          queryClass: "comparison",
          intent: "comparison",
          businessValue: 80,
          relevance: 85,
          demandEvidence: {
            source: "brand_brain",
            description: `Direct comparison query against known competitor ${compClean}.`,
          },
          confidence: "MEDIUM",
        });
      }
    }
  }

  // 4. Branded queries
  const brandQuery = input.businessName.trim().toLowerCase();
  if (!queryMap.has(brandQuery)) {
    queryMap.set(brandQuery, {
      fingerprint: stableFingerprint([input.businessName, brandQuery]),
      query: input.businessName.trim(),
      queryClass: "branded",
      intent: "branded",
      businessValue: 70,
      relevance: 100,
      demandEvidence: {
        source: "brand_brain",
        description: "Primary brand navigation query.",
      },
      confidence: "HIGH",
    });
  }

  // 5. Rank and prioritize queries
  const sortedQueries = Array.from(queryMap.values()).sort((a, b) => {
    // Priority formula: businessValue (0.5) + relevance (0.3) + GSC bonus (0.2)
    const scoreA =
      a.businessValue * 0.5 +
      a.relevance * 0.3 +
      (a.demandEvidence.source === "gsc" ? 20 : 0);
    const scoreB =
      b.businessValue * 0.5 +
      b.relevance * 0.3 +
      (b.demandEvidence.source === "gsc" ? 20 : 0);
    return scoreB - scoreA;
  });

  return sortedQueries.slice(0, maxQueries);
}
