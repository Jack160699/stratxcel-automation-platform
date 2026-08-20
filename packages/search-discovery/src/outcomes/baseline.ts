import type { ActionBaselineSnapshot, ActionBaselineMetrics } from "./types.ts";

export function getDefaultObservationWindowDays(actionType: string): number {
  if (actionType.startsWith("FIX_MISSING_TITLE") || actionType.startsWith("FIX_TITLE_LENGTH") || actionType.startsWith("FIX_MISSING_META")) {
    return 21; // Metadata observation window: 21 days
  }
  if (actionType.startsWith("FIX_") || actionType.startsWith("INSERT_SCHEMA") || actionType.startsWith("CORRECT_SCHEMA")) {
    return 14; // Technical fix observation window: 14 days
  }
  if (actionType.startsWith("REPAIR_ORPHAN") || actionType.startsWith("ADD_TOPIC_CLUSTER") || actionType.startsWith("BUILD_HUB")) {
    return 30; // Internal linking observation window: 30 days
  }
  if (actionType.startsWith("CREATE_SERVICE") || actionType.startsWith("CREATE_LOCATION") || actionType.startsWith("CREATE_SUPPORTING")) {
    return 45; // New content page observation window: 45 days
  }
  if (actionType.startsWith("REFRESH_") || actionType.startsWith("EXPAND_")) {
    return 60; // Content refresh observation window: 60 days
  }
  if (actionType.startsWith("INJECT_ENTITY") || actionType.startsWith("STRUCTURE_FACTUAL")) {
    return 30; // AI search citation window: 30 days
  }
  return 30;
}

export function captureActionBaselineSnapshot(input: {
  actionId: string;
  targetUrl: string;
  metrics?: Partial<ActionBaselineMetrics>;
  queryRankings?: Array<{ query: string; position: number | null }>;
  aiCitations?: Array<{ platform: string; cited: boolean; query: string }>;
}): ActionBaselineSnapshot {
  const now = new Date().toISOString();

  return {
    actionId: input.actionId,
    targetUrl: input.targetUrl,
    metrics: {
      gscImpressions: input.metrics?.gscImpressions,
      gscClicks: input.metrics?.gscClicks,
      gscCtr: input.metrics?.gscCtr,
      gscAveragePosition: input.metrics?.gscAveragePosition,
      targetQueryPosition: input.metrics?.targetQueryPosition,
      aiBrandMentioned: input.metrics?.aiBrandMentioned,
      aiClientCited: input.metrics?.aiClientCited,
      organicSessions: input.metrics?.organicSessions,
      capturedAt: now,
    },
    queryRankings: input.queryRankings || [],
    aiCitations: input.aiCitations || [],
    capturedAt: now,
  };
}
