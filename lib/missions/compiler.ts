import { SERVICE_CATALOGUE } from "../service-catalogue/catalogue.ts";
import type { CompiledMission } from "./types";

/**
 * v1 goal-to-mission compiler: deterministic keyword matching against the
 * service catalogue, not an LLM call. This keeps mission compilation fast,
 * free, and unit-testable without a network dependency, and gives Hermes's
 * stratxcel-orchestrator profile a clear fallback (`custom_mission`) for
 * anything it doesn't recognize rather than guessing. A future phase can
 * replace this with an LLM-assisted compiler behind the same
 * `compileGoalToMission` signature without touching call sites.
 */
export function compileGoalToMission(goalText: string): CompiledMission {
  const normalized = goalText.toLowerCase();

  // Picks the longest matching keyword across the whole catalogue, not the
  // first catalogue entry that matches anything — otherwise a generic
  // keyword on an earlier entry (e.g. "site") would shadow a more specific
  // match on a later one (e.g. "seo audit") purely because of array order.
  let match: (typeof SERVICE_CATALOGUE)[number] | undefined;
  let bestKeywordLength = 0;
  for (const entry of SERVICE_CATALOGUE) {
    for (const keyword of entry.keywords) {
      if (keyword.length > bestKeywordLength && normalized.includes(keyword)) {
        match = entry;
        bestKeywordLength = keyword.length;
      }
    }
  }

  if (match) {
    return {
      goalText,
      serviceKey: match.key,
      hermesProfile: match.hermesProfile,
      estimatedCostCents: match.baseCostCents,
      matched: true,
    };
  }

  const fallback = SERVICE_CATALOGUE.find((entry) => entry.key === "custom_mission")!;
  return {
    goalText,
    serviceKey: fallback.key,
    hermesProfile: fallback.hermesProfile,
    estimatedCostCents: fallback.baseCostCents,
    matched: false,
  };
}
