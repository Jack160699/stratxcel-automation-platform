import { createHash } from "node:crypto";
import type { CompetitorDeltaResult } from "../measurement/types.ts";
import type { AICitationGap } from "../ai-search/types.ts";
import type { GrowthAlert } from "./types.ts";

function stableFingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function generateContinuousDefenseAlerts(input: {
  deltas: CompetitorDeltaResult[];
  aiGaps: AICitationGap[];
}): GrowthAlert[] {
  const alerts: GrowthAlert[] = [];
  const now = new Date().toISOString();

  // 1. Competitor Overtake Alerts
  for (const delta of input.deltas) {
    if (delta.deltaType === "CLIENT_LOST" && delta.clientOldPosition && delta.clientNewPosition) {
      const drop = delta.clientNewPosition - delta.clientOldPosition;
      if (drop >= 2) {
        alerts.push({
          id: stableFingerprint(["alert_drop", delta.query, delta.clientNewPosition]),
          type: "VISIBILITY_DROP",
          severity: delta.clientOldPosition <= 3 ? "CRITICAL" : "HIGH",
          title: `Search Ranking Drop on "${delta.query}"`,
          message: `Rank slipped from #${delta.clientOldPosition} to #${delta.clientNewPosition} (${drop} positions).`,
          evidence: [
            `Query: "${delta.query}"`,
            `Previous rank: #${delta.clientOldPosition}`,
            `Current rank: #${delta.clientNewPosition}`,
          ],
          recommendedAction: `Inspect on-page schema and refresh content relevance for "${delta.query}".`,
          createdAt: now,
        });
      }
    }

    if (delta.deltaType === "COMPETITOR_GAINED" && delta.competitorNewPosition && delta.competitorNewPosition <= 3) {
      alerts.push({
        id: stableFingerprint(["alert_comp_gain", delta.query, delta.competitorDomain]),
        type: "COMPETITOR_OVERTAKE",
        severity: "HIGH",
        title: `Competitor Overtake: ${delta.competitorDomain}`,
        message: `${delta.competitorDomain} gained search visibility and now holds #${delta.competitorNewPosition} on "${delta.query}".`,
        evidence: [
          `Competitor: ${delta.competitorDomain}`,
          `Query: "${delta.query}"`,
          `Current position: #${delta.competitorNewPosition}`,
        ],
        recommendedAction: "Execute competitive counter-action to reclaim search impression share.",
        createdAt: now,
      });
    }
  }

  // 2. AI Citation Loss / Gap Alerts
  for (const gap of input.aiGaps.slice(0, 3)) {
    alerts.push({
      id: stableFingerprint(["alert_ai_gap", gap.query, gap.competitorCited]),
      type: "AI_CITATION_LOSS",
      severity: "MEDIUM",
      title: `AI Search Citation Gap on ${gap.platform}`,
      message: `Competitor "${gap.competitorCited}" was cited for "${gap.query}" while client was omitted.`,
      evidence: gap.evidence,
      recommendedAction: gap.proposedAction,
      createdAt: now,
    });
  }

  return alerts;
}
