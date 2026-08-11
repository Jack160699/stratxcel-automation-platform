/**
 * Learning loop contracts — interfaces/events only.
 * Only actual measured signals may become performance evidence.
 */
export type LearningSignalKind = "measured_performance" | "analytics_evidence" | "optimization_recommendation";

export interface MeasuredPerformanceSignal {
  kind: "measured_performance";
  tenantId: string;
  missionId?: string;
  planId?: string;
  metric: string;
  value: number;
  unit: string;
  observedAt: string;
  source: string;
  evidenceId: string;
}

export interface OptimizationRecommendationEvent {
  kind: "optimization_recommendation";
  tenantId: string;
  planId: string;
  basedOnEvidenceIds: readonly string[];
  recommendation: string;
  proposedPlanVersion: number;
  department: string;
  createdAt: string;
}

export function assertMeasuredSignal(signal: MeasuredPerformanceSignal): void {
  if (!signal.evidenceId) throw new Error("performance_evidence_required");
  if (!signal.source) throw new Error("performance_source_required");
  if (!Number.isFinite(signal.value)) throw new Error("performance_value_invalid");
}
