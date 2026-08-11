/**
 * Learning loop contracts — interfaces/events only.
 * Only actual measured signals may become performance evidence.
 * Model opinions are never performance evidence.
 */
export type LearningSignalKind =
  | "measured_performance"
  | "analytics_evidence"
  | "optimization_recommendation";

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

/** Analytics evidence packet — must reference measured observation ids, not opinions. */
export interface AnalyticsEvidenceSignal {
  kind: "analytics_evidence";
  tenantId: string;
  missionId?: string;
  planId?: string;
  observationIds: readonly string[];
  evidenceIds: readonly string[];
  summary: string;
  createdAt: string;
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

export type LearningSignal =
  | MeasuredPerformanceSignal
  | AnalyticsEvidenceSignal
  | OptimizationRecommendationEvent;

export function assertMeasuredSignal(signal: MeasuredPerformanceSignal): void {
  if (!signal.evidenceId) throw new Error("performance_evidence_required");
  if (!signal.source) throw new Error("performance_source_required");
  if (!Number.isFinite(signal.value)) throw new Error("performance_value_invalid");
}

export function assertAnalyticsEvidence(signal: AnalyticsEvidenceSignal): void {
  if (!signal.tenantId) throw new Error("analytics_evidence_tenant_required");
  if (signal.observationIds.length === 0) throw new Error("analytics_evidence_requires_observations");
  if (signal.evidenceIds.length === 0) throw new Error("analytics_evidence_requires_evidence");
}
