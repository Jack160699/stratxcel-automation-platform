/**
 * Weekly & monthly performance reviews.
 */

import { summarizeExecutedFromReceipts } from "./receipts.ts";
import { unusedEntitlements } from "./usage.ts";
import type {
  AnomalyFlag,
  ExecutionReceipt,
  MetricObservation,
  MonthlyGrowthReview,
  OptimizationRecommendation,
  UsageAccountingRow,
  WeeklyPerformanceReview,
} from "./types.ts";

export interface BuildWeeklyReviewInput {
  id: string;
  tenantId: string;
  planId?: string;
  missionId?: string;
  weekStartIso: string;
  weekEndIso: string;
  receipts: readonly ExecutionReceipt[];
  observations: readonly MetricObservation[];
  anomalies: readonly AnomalyFlag[];
  blockers?: readonly string[];
  recommendation: OptimizationRecommendation | null;
  audience: "customer" | "admin";
  nowIso: string;
  whatWorked?: readonly string[];
  whatUnderperformed?: readonly string[];
}

function assertTenant(
  tenantId: string,
  observations: readonly MetricObservation[],
  receipts: readonly ExecutionReceipt[],
  anomalies: readonly AnomalyFlag[],
): void {
  for (const o of observations) {
    if (o.tenantId !== tenantId) throw new Error("cross_tenant_observation_rejected");
  }
  for (const r of receipts) {
    if (r.tenantId !== tenantId) throw new Error("cross_tenant_receipt_rejected");
  }
  for (const a of anomalies) {
    if (a.tenantId !== tenantId) throw new Error("cross_tenant_anomaly_rejected");
  }
}

export function buildWeeklyPerformanceReview(input: BuildWeeklyReviewInput): WeeklyPerformanceReview {
  assertTenant(input.tenantId, input.observations, input.receipts, input.anomalies);
  if (input.recommendation && input.recommendation.tenantId !== input.tenantId) {
    throw new Error("cross_tenant_recommendation_rejected");
  }

  const evidenceIds = [
    ...new Set([
      ...input.observations.flatMap((o) => o.evidence.map((e) => e.id)),
      ...input.anomalies.flatMap((a) => a.evidenceIds),
      ...(input.recommendation?.evidenceIds ?? []),
      ...input.receipts.flatMap((r) => r.evidenceIds),
    ]),
  ];

  return {
    id: input.id,
    tenantId: input.tenantId,
    planId: input.planId,
    missionId: input.missionId,
    weekStartIso: input.weekStartIso,
    weekEndIso: input.weekEndIso,
    whatExecuted: summarizeExecutedFromReceipts(input.receipts),
    whatWorked: input.whatWorked ?? [],
    whatUnderperformed: input.whatUnderperformed ?? [],
    evidenceIds,
    observationIds: input.observations.map((o) => o.id),
    anomalies: input.anomalies,
    blockers: input.blockers ?? [],
    recommendation: input.recommendation,
    shouldChangePlan: input.recommendation?.shouldRevisePlan === true,
    audience: input.audience,
    createdAtIso: input.nowIso,
  };
}

export interface BuildMonthlyReviewInput {
  id: string;
  tenantId: string;
  planId: string;
  missionId?: string;
  monthStartIso: string;
  monthEndIso: string;
  originalDiagnosis: string;
  originalPriorities: readonly string[];
  receipts: readonly ExecutionReceipt[];
  observations: readonly MetricObservation[];
  changedBottlenecks?: readonly string[];
  strongestGains?: readonly string[];
  failures?: readonly string[];
  usage: readonly UsageAccountingRow[];
  nextMonthRecommendation: OptimizationRecommendation | null;
  audience: "customer" | "admin";
  nowIso: string;
  results?: readonly string[];
}

export function buildMonthlyGrowthReview(input: BuildMonthlyReviewInput): MonthlyGrowthReview {
  assertTenant(input.tenantId, input.observations, input.receipts, []);
  if (input.nextMonthRecommendation && input.nextMonthRecommendation.tenantId !== input.tenantId) {
    throw new Error("cross_tenant_recommendation_rejected");
  }

  const evidenceIds = [
    ...new Set([
      ...input.observations.flatMap((o) => o.evidence.map((e) => e.id)),
      ...(input.nextMonthRecommendation?.evidenceIds ?? []),
      ...input.receipts.flatMap((r) => r.evidenceIds),
    ]),
  ];

  const results =
    input.results ??
    input.observations.map(
      (o) => `${o.metric}=${o.value}${o.unit === "count" ? "" : ` ${o.unit}`} (${o.source})`,
    );

  return {
    id: input.id,
    tenantId: input.tenantId,
    planId: input.planId,
    missionId: input.missionId,
    monthStartIso: input.monthStartIso,
    monthEndIso: input.monthEndIso,
    originalDiagnosis: input.originalDiagnosis,
    originalPriorities: input.originalPriorities,
    executedWork: summarizeExecutedFromReceipts(input.receipts),
    results,
    changedBottlenecks: input.changedBottlenecks ?? [],
    strongestGains: input.strongestGains ?? [],
    failures: input.failures ?? [],
    unusedEntitlements: unusedEntitlements(input.usage),
    nextMonthRecommendation: input.nextMonthRecommendation,
    evidenceIds,
    observationIds: input.observations.map((o) => o.id),
    audience: input.audience,
    createdAtIso: input.nowIso,
  };
}
