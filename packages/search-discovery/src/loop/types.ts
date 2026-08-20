/**
 * Continuous Search Growth Loop Types
 */

export type SearchStrategyMode = "TAKE" | "DEFEND" | "EXPAND" | "RECOVER";

export type MovementStatus = "GAINING" | "STABLE" | "DECLINING" | "UNKNOWN";

export interface GrowthAlert {
  id: string;
  type: "COMPETITOR_OVERTAKE" | "AI_CITATION_LOSS" | "VISIBILITY_DROP" | "TECHNICAL_REGRESSION";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  message: string;
  evidence: string[];
  recommendedAction: string;
  createdAt: string;
}

export interface GrowthTimelineEvent {
  id: string;
  stage: "OBSERVED" | "DIAGNOSED" | "ACTION_TAKEN" | "VERIFIED" | "SEARCH_RESULT" | "AI_RESULT";
  title: string;
  description: string;
  timestamp: string;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  metricChange?: string;
}

export interface ContinuousLoopResult {
  strategyMode: SearchStrategyMode;
  movementStatus: MovementStatus;
  alerts: GrowthAlert[];
  timeline: GrowthTimelineEvent[];
  aiScore?: Record<string, unknown>;
  reEvaluatedOpportunitiesCount: number;
}
