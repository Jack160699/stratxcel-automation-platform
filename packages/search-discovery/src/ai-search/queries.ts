import { createHash } from "node:crypto";
import type { AIVisibilityQuery, AIQueryClass } from "./types.ts";

export interface AIQueryGeneratorInput {
  businessName: string;
  services: string[];
  locations: string[];
  competitors?: string[];
  limit?: number;
}

function stableFingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

/**
 * Deterministically generates prompt-style questions commonly evaluated by generative AI engines.
 */
export function generateAISearchQuerySet(input: AIQueryGeneratorInput): AIVisibilityQuery[] {
  const queries: AIVisibilityQuery[] = [];
  const primaryLoc = input.locations[0] || "";
  const primaryService = input.services[0] || "services";

  // 1. Recommendation / "Best" Prompts
  for (const service of input.services.slice(0, 3)) {
    for (const loc of input.locations.slice(0, 2)) {
      const q = `Who is the best ${service.toLowerCase()} in ${loc}?`;
      queries.push({
        fingerprint: stableFingerprint(["ai_rec", service, loc]),
        query: q,
        queryClass: "commercial",
        intent: "recommendation",
        targetLocation: loc,
        expectedEntities: [input.businessName, service, loc],
        businessValue: 95,
      });
    }
  }

  // 2. Comparison Prompts (Client vs Competitors)
  if (input.competitors && input.competitors.length > 0) {
    for (const comp of input.competitors.slice(0, 2)) {
      const compName = typeof comp === "string" ? comp : (comp as any).businessName || comp;
      const q = `Compare ${input.businessName} vs ${compName} for ${primaryService}`;
      queries.push({
        fingerprint: stableFingerprint(["ai_comp", input.businessName, compName]),
        query: q,
        queryClass: "comparison",
        intent: "comparison",
        targetLocation: primaryLoc,
        expectedEntities: [input.businessName, compName],
        businessValue: 90,
      });
    }
  }

  // 3. Local Finder Prompts
  if (primaryLoc) {
    const q = `Top rated ${primaryService.toLowerCase()} near me in ${primaryLoc}`;
    queries.push({
      fingerprint: stableFingerprint(["ai_local_top", primaryService, primaryLoc]),
      query: q,
      queryClass: "local",
      intent: "local_finder",
      targetLocation: primaryLoc,
      expectedEntities: [input.businessName, primaryLoc],
      businessValue: 88,
    });
  }

  // 4. Informational & Educational Prompts
  for (const service of input.services.slice(0, 2)) {
    const q = `How to choose a reliable ${service.toLowerCase()}${primaryLoc ? ` in ${primaryLoc}` : ""}?`;
    queries.push({
      fingerprint: stableFingerprint(["ai_info_choose", service, primaryLoc]),
      query: q,
      queryClass: "informational",
      intent: "how_to",
      targetLocation: primaryLoc,
      expectedEntities: [service],
      businessValue: 75,
    });
  }

  // 5. Branded Factual Prompts
  queries.push({
    fingerprint: stableFingerprint(["ai_brand_fact", input.businessName]),
    query: `What services does ${input.businessName} provide and what are their reviews?`,
    queryClass: "branded",
    intent: "factual",
    targetLocation: primaryLoc,
    expectedEntities: [input.businessName],
    businessValue: 85,
  });

  const maxQueries = input.limit || 8;
  return queries.slice(0, maxQueries);
}
