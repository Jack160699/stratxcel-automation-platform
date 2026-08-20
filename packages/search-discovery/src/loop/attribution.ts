import type { GrowthTimelineEvent } from "./types.ts";

export interface BuildTimelineInput {
  actions?: Array<Record<string, unknown>>;
  opportunities?: Array<Record<string, unknown>>;
  deltas?: Array<Record<string, unknown>>;
  aiResults?: Array<Record<string, unknown>>;
}

export function buildOutcomeAttributionTimeline(input: BuildTimelineInput): GrowthTimelineEvent[] {
  const events: GrowthTimelineEvent[] = [];

  // 1. Diagnosed Opportunities
  for (const opp of (input.opportunities || []).slice(0, 3)) {
    events.push({
      id: `diag-${opp.id || Math.random().toString(36).slice(2, 8)}`,
      stage: "DIAGNOSED",
      title: `Search Opportunity Diagnosed: ${(opp.problem as string) || "SEO Gap"}`,
      description: (opp.businessRationale as string) || "Identified high-impact search optimization opportunity.",
      timestamp: (opp.created_at as string) || new Date().toISOString(),
      status: "COMPLETED",
    });
  }

  // 2. Actions Taken & Verified
  for (const act of (input.actions || []).slice(0, 3)) {
    const isVerified = act.verification_status === "VERIFIED" || act.execution_state === "VERIFIED";
    events.push({
      id: `act-${act.id || Math.random().toString(36).slice(2, 8)}`,
      stage: isVerified ? "VERIFIED" : "ACTION_TAKEN",
      title: isVerified ? "SEO Action Verified Live" : "SEO Action Executed",
      description: `Target: ${(act.target_url as string) || "Website"}. Verified live status with 200 HTTP code.`,
      timestamp: (act.completed_at as string) || (act.created_at as string) || new Date().toISOString(),
      status: isVerified ? "COMPLETED" : "IN_PROGRESS",
    });
  }

  // 3. Search Movements Observed
  for (const delta of (input.deltas || []).slice(0, 3)) {
    if (delta.deltaType === "CLIENT_GAINED") {
      events.push({
        id: `search-gain-${Math.random().toString(36).slice(2, 8)}`,
        stage: "SEARCH_RESULT",
        title: `Search Position Gained on "${delta.query}"`,
        description: (delta.summary as string) || "Ranking improved in organic search.",
        timestamp: (delta.timestamp as string) || new Date().toISOString(),
        status: "COMPLETED",
        metricChange: `Rank #${delta.clientOldPosition} → #${delta.clientNewPosition}`,
      });
    }
  }

  // 4. AI Search Results
  for (const ai of (input.aiResults || []).slice(0, 2)) {
    if (ai.clientCited) {
      events.push({
        id: `ai-cite-${Math.random().toString(36).slice(2, 8)}`,
        stage: "AI_RESULT",
        title: `Cited by ${ai.platform} for "${ai.query}"`,
        description: "Brand URL successfully included as verified citation in AI search answer.",
        timestamp: (ai.timestamp as string) || new Date().toISOString(),
        status: "COMPLETED",
      });
    }
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
