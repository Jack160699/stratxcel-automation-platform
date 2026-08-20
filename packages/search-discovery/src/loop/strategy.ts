import type { CompetitorDeltaResult, CompetitorQuerySnapshot } from "../measurement/types.ts";
import type { SearchStrategyMode, MovementStatus } from "./types.ts";

export interface StrategyEvaluation {
  mode: SearchStrategyMode;
  movement: MovementStatus;
  rationale: string;
  focusArea: string;
}

export function evaluateStrategyMode(input: {
  deltas: CompetitorDeltaResult[];
  snapshots: CompetitorQuerySnapshot[];
}): StrategyEvaluation {
  const lostDeltas = input.deltas.filter((d) => d.deltaType === "CLIENT_LOST");
  const gainedDeltas = input.deltas.filter((d) => d.deltaType === "CLIENT_GAINED");

  // 1. RECOVER Check: Meaningful visibility loss (e.g. lost positions on multiple queries)
  if (lostDeltas.length >= 2 || lostDeltas.some((d) => (d.clientOldPosition || 0) <= 5 && (d.clientNewPosition || 0) > 8)) {
    return {
      mode: "RECOVER",
      movement: "DECLINING",
      rationale: "Recent organic ranking decline detected on core search queries. Priority is diagnosing causes and restoring lost search visibility.",
      focusArea: "Diagnose on-page technical factors, search console impressions drop, and competitor content improvements.",
    };
  }

  // 2. DEFEND Check: Client is holding dominant Top 3 position
  const topPositions = input.snapshots.filter((s) => s.clientPosition !== null && s.clientPosition <= 3);
  if (topPositions.length >= 2 && gainedDeltas.length >= lostDeltas.length) {
    return {
      mode: "DEFEND",
      movement: "GAINING",
      rationale: "Client holds top 3 ranking positions for primary target queries. Focus is protecting established search leadership.",
      focusArea: "Monitor competitor shifts, expand FAQ schema, and refresh core content freshness.",
    };
  }

  // 3. TAKE Check: Competitors are ahead on high-value commercial queries
  const competitorAheadCount = input.snapshots.filter((s) => s.competitors.some((c) => c.isAhead)).length;
  if (competitorAheadCount > 0) {
    return {
      mode: "TAKE",
      movement: "STABLE",
      rationale: "Competitors currently outrank client on primary commercial queries. Strategy is executing target content and entity upgrades to capture ranking share.",
      focusArea: "Close competitor keyword topical gaps and deploy verified local entity schemas.",
    };
  }

  // 4. Default: EXPAND Check
  return {
    mode: "EXPAND",
    movement: "STABLE",
    rationale: "Current search footprint is stable. Strategy is capturing adjacent high-intent search queries and expanding AI search citations.",
    focusArea: "Generate targeted sub-service pages and expand conversational AI prompt visibility.",
  };
}
