/**
 * Action Outcome Measurement, Experimentation & Learning Types
 */

export type ActionOutcomeState =
  | "PLANNED"
  | "EXECUTED"
  | "VERIFIED"
  | "IN_WINDOW"
  | "OBSERVED"
  | "IMPROVED"
  | "NO_EFFECT"
  | "NEGATIVE_EFFECT"
  | "INCONCLUSIVE";

export type AttributionConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type ExperimentDecision =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "NOT_SUPPORTED"
  | "INCONCLUSIVE";

export type OutcomeQueryClass =
  | "COMMERCIAL"
  | "LOCAL"
  | "INFORMATIONAL"
  | "COMPARISON"
  | "BRANDED"
  | "NON_BRANDED"
  | "HIGH_INTENT"
  | "SUPPORTING";


export interface ActionBaselineMetrics {
  gscImpressions?: number;
  gscClicks?: number;
  gscCtr?: number;
  gscAveragePosition?: number;
  targetQueryPosition?: number;
  aiBrandMentioned?: boolean;
  aiClientCited?: boolean;
  organicSessions?: number;
  capturedAt: string;
}

export interface ActionBaselineSnapshot {
  actionId: string;
  targetUrl: string;
  metrics: ActionBaselineMetrics;
  queryRankings: Array<{ query: string; position: number | null }>;
  aiCitations: Array<{ platform: string; cited: boolean; query: string }>;
  capturedAt: string;
}

export interface ActionExperimentRecord {
  id: string;
  tenantId: string;
  actionId: string;
  actionType: string;
  industry: string;
  queryClass: OutcomeQueryClass;
  hypothesis: string;
  observationWindowDays: number;
  status: ActionOutcomeState;
  baselineMetrics: ActionBaselineMetrics;
  observedMetrics?: ActionBaselineMetrics;
  deltaMetrics?: {
    impressionChangePct?: number;
    clickChangePct?: number;
    positionImprovement?: number; // e.g. +3.2 positions
    aiCitationGained?: boolean;
  };
  attributionConfidence: AttributionConfidence;
  decision: ExperimentDecision;
  explanation: string;
  lastEvaluatedAt: string;
}

export interface ActionEffectivenessStats {
  actionType: string;
  industry?: string;
  queryClass?: OutcomeQueryClass;
  totalActionsCount: number;
  verifiedRate: number; // 0-100
  improvementRate: number; // 0-100
  noEffectRate: number; // 0-100
  negativeEffectRate: number; // 0-100
  medianDaysToEffect: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sampleSizeSufficient: boolean;
}

export interface NegativeOutcomeAlert {
  actionId: string;
  actionType: string;
  targetUrl: string;
  metricDeclined: string;
  baselineValue: number;
  observedValue: number;
  daysSinceExecution: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  recommendedAction: "INVESTIGATE" | "POSSIBLE_ROLLBACK" | "RECOVERY_ACTION";
}
