/**
 * Optimization recommendations — propose actions, never mutate externally.
 */

import { compareToBaseline } from "./baselines.ts";
import type {
  AnomalyFlag,
  AttributionLink,
  MetricObservation,
  OptimizationAction,
  OptimizationRecommendation,
} from "./types.ts";

export class OptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimizationError";
  }
}

export interface ProposeOptimizationInput {
  id: string;
  tenantId: string;
  planId: string;
  missionId?: string;
  target: string;
  observations: readonly MetricObservation[];
  attributions: readonly AttributionLink[];
  anomalies: readonly AnomalyFlag[];
  evidenceIds: readonly string[];
  nowIso: string;
  preferContinueWhenHealthy?: boolean;
}

function pickAction(args: {
  anomalies: readonly AnomalyFlag[];
  observations: readonly MetricObservation[];
  preferContinueWhenHealthy: boolean;
}): {
  action: OptimizationAction;
  rationale: string;
  shouldRevisePlan: boolean;
  confidence: "low" | "medium" | "high";
} {
  const actionable = args.anomalies.filter((a) => a.sampleSizeAdequate && (a.severity === "high" || a.severity === "medium"));
  const highAnomalies = args.anomalies.filter((a) => a.severity === "high" && a.sampleSizeAdequate);
  if (highAnomalies.some((a) => a.kind === "tracking_loss" || a.kind === "zero_data_integration")) {
    return {
      action: "RESEARCH_MORE",
      rationale: "Measurement integrity issue — research tracking before changing execution",
      shouldRevisePlan: false,
      confidence: "high",
    };
  }
  if (actionable.some((a) => a.kind === "publishing_failures")) {
    return {
      action: "PAUSE",
      rationale: "Publishing failures require pause until execution path is healthy",
      shouldRevisePlan: true,
      confidence: "high",
    };
  }
  if (highAnomalies.some((a) => a.kind === "sudden_traffic_drop" || a.kind === "lead_volume_drop")) {
    return {
      action: "REVISE",
      rationale: "Material drop in measured outcomes with adequate sample — revise plan",
      shouldRevisePlan: true,
      confidence: "medium",
    };
  }
  if (highAnomalies.some((a) => a.kind === "response_time_increase")) {
    return {
      action: "CHANGE_SEQUENCE",
      rationale: "Response-time regression suggests reordering CRM/response work ahead of acquisition",
      shouldRevisePlan: true,
      confidence: "medium",
    };
  }

  let improving = 0;
  let declining = 0;
  for (const obs of args.observations) {
    if (!obs.baselineRef || obs.baselineRef.missing) continue;
    const cmp = compareToBaseline(obs, obs.baselineRef);
    if (!cmp.comparable || cmp.deltaPercent === null) continue;
    if (cmp.deltaPercent >= 20) improving += 1;
    if (cmp.deltaPercent <= -20) declining += 1;
  }

  if (improving > 0 && declining === 0 && highAnomalies.length === 0) {
    return {
      action: "SCALE",
      rationale: "Measured improvements vs baseline with no high-severity anomalies — candidate to scale",
      shouldRevisePlan: false,
      confidence: "medium",
    };
  }
  if (declining > improving && highAnomalies.length === 0) {
    return {
      action: "REDUCE",
      rationale: "Measured declines vs baseline — reduce until evidence supports growth again",
      shouldRevisePlan: false,
      confidence: "medium",
    };
  }

  return {
    action: "CONTINUE",
    rationale: args.preferContinueWhenHealthy
      ? "Healthy or inconclusive performance — continue without unnecessary change"
      : "Insufficient evidence for change — continue current plan",
    shouldRevisePlan: false,
    confidence: args.preferContinueWhenHealthy ? "medium" : "low",
  };
}

export function proposeOptimization(input: ProposeOptimizationInput): OptimizationRecommendation {
  if (!input.tenantId) throw new OptimizationError("tenant_required");
  if (!input.planId) throw new OptimizationError("plan_required");
  if (input.evidenceIds.length === 0 && input.observations.length === 0 && input.anomalies.length === 0) {
    throw new OptimizationError("optimization_requires_evidence");
  }

  for (const o of input.observations) {
    if (o.tenantId !== input.tenantId) throw new OptimizationError("cross_tenant_observation_rejected");
  }
  for (const a of input.attributions) {
    if (a.tenantId !== input.tenantId) throw new OptimizationError("cross_tenant_attribution_rejected");
  }
  for (const a of input.anomalies) {
    if (a.tenantId !== input.tenantId) throw new OptimizationError("cross_tenant_anomaly_rejected");
  }

  const picked = pickAction({
    anomalies: input.anomalies,
    observations: input.observations,
    preferContinueWhenHealthy: input.preferContinueWhenHealthy ?? true,
  });

  const evidenceIds = [
    ...new Set([
      ...input.evidenceIds,
      ...input.observations.flatMap((o) => o.evidence.map((e) => e.id)),
      ...input.anomalies.flatMap((a) => a.evidenceIds),
      ...input.attributions.flatMap((a) => a.evidenceIds),
    ]),
  ];

  return {
    id: input.id,
    tenantId: input.tenantId,
    planId: input.planId,
    missionId: input.missionId,
    action: picked.action,
    target: input.target,
    rationale: picked.rationale,
    evidenceIds,
    observationIds: input.observations.map((o) => o.id),
    attributionIds: input.attributions.map((a) => a.id),
    anomalyIds: input.anomalies.map((a) => a.id),
    shouldRevisePlan: picked.shouldRevisePlan,
    mutatesExternalSystems: false,
    createdAtIso: input.nowIso,
    confidence: picked.confidence,
  };
}

export function assertNoExternalMutation(rec: OptimizationRecommendation): void {
  if (rec.mutatesExternalSystems !== false) {
    throw new OptimizationError("recommendation_must_not_mutate");
  }
}
