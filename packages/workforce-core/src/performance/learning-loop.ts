/**
 * Learning loop:
 * actual result → evidence → optimization recommendation → Business Growth Plan revision
 *
 * Rules:
 * - Only measured signals count (no model opinions as performance evidence)
 * - Revision requires evidence
 * - Historical plan preserved (immutable prior version via revision record)
 * - No automatic external mutation
 */

import {
  assertMeasuredSignal,
  type MeasuredPerformanceSignal,
  type OptimizationRecommendationEvent,
} from "../learning/types.ts";
import { reviseThirtyDayPlan } from "../planning/thirty-day-planner.ts";
import type { BusinessGrowthPlan, ThirtyDayPlanRevisionInput } from "../planning/types.ts";
import { assertNoExternalMutation } from "./optimization.ts";
import type { MetricObservation, OptimizationRecommendation, PlanRevisionRecord } from "./types.ts";

export class LearningLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningLoopError";
  }
}

export function observationToMeasuredSignal(obs: MetricObservation): MeasuredPerformanceSignal {
  if (obs.evidence.length === 0) {
    throw new LearningLoopError("observation_missing_evidence");
  }
  const signal: MeasuredPerformanceSignal = {
    kind: "measured_performance",
    tenantId: obs.tenantId,
    missionId: obs.missionId,
    planId: obs.planId,
    metric: obs.metric,
    value: obs.value,
    unit: obs.unit,
    observedAt: obs.retrievedAt,
    source: obs.source,
    evidenceId: obs.evidence[0]!.id,
  };
  assertMeasuredSignal(signal);
  return signal;
}

export function recommendationToLearningEvent(
  rec: OptimizationRecommendation,
  proposedPlanVersion: number,
): OptimizationRecommendationEvent {
  assertNoExternalMutation(rec);
  return {
    kind: "optimization_recommendation",
    tenantId: rec.tenantId,
    planId: rec.planId,
    basedOnEvidenceIds: rec.evidenceIds,
    recommendation: `${rec.action}: ${rec.rationale}`,
    proposedPlanVersion,
    department: "optimization",
    createdAt: rec.createdAtIso,
  };
}

export interface ApplyLearningRevisionInput {
  currentPlan: BusinessGrowthPlan;
  recommendation: OptimizationRecommendation;
  patch: ThirtyDayPlanRevisionInput["patch"];
  proposedByDepartment?: ThirtyDayPlanRevisionInput["proposedByDepartment"];
  nowIso: string;
}

export interface LearningRevisionResult {
  revisedPlan: BusinessGrowthPlan;
  revisionRecord: PlanRevisionRecord;
  learningEvent: OptimizationRecommendationEvent;
  externalMutations: [];
}

export function applyLearningRevision(input: ApplyLearningRevisionInput): LearningRevisionResult {
  const { currentPlan, recommendation } = input;

  if (recommendation.tenantId !== currentPlan.tenantId) {
    throw new LearningLoopError("cross_tenant_learning_rejected");
  }
  const planMatches =
    recommendation.planId === currentPlan.id || recommendation.planId === currentPlan.workforcePlan.id;
  if (!planMatches) {
    throw new LearningLoopError("plan_id_mismatch");
  }
  if (recommendation.evidenceIds.length === 0) {
    throw new LearningLoopError("revision_requires_evidence");
  }
  if (!recommendation.shouldRevisePlan) {
    throw new LearningLoopError("recommendation_does_not_request_revision");
  }
  assertNoExternalMutation(recommendation);

  const fromVersion = currentPlan.version;
  const previousPlanArtifactId = currentPlan.workforcePlan.id;

  const revisedPlan = reviseThirtyDayPlan(currentPlan, {
    revisionReason: `${recommendation.action}: ${recommendation.rationale}`,
    evidenceIds: recommendation.evidenceIds,
    proposedByDepartment: input.proposedByDepartment ?? "optimization",
    patch: input.patch,
  });

  if (revisedPlan.version !== fromVersion + 1) {
    throw new LearningLoopError("version_increment_failed");
  }

  const revisionRecord: PlanRevisionRecord = {
    planId: currentPlan.id,
    tenantId: currentPlan.tenantId,
    fromVersion,
    toVersion: revisedPlan.version,
    previousPlanArtifactId,
    revisionReason: `${recommendation.action}: ${recommendation.rationale}`,
    evidenceIds: recommendation.evidenceIds,
    recommendationId: recommendation.id,
    preservedCommercialContext: true,
    createdAtIso: input.nowIso,
  };

  const learningEvent = recommendationToLearningEvent(recommendation, revisedPlan.version);

  return {
    revisedPlan,
    revisionRecord,
    learningEvent,
    externalMutations: [],
  };
}

export function rejectOpinionAsEvidence(args: {
  claimedEvidenceId?: string;
  isMeasured: boolean;
  source?: string;
}): void {
  if (!args.isMeasured) {
    throw new LearningLoopError("model_opinion_is_not_performance_evidence");
  }
  if (!args.claimedEvidenceId) {
    throw new LearningLoopError("performance_evidence_required");
  }
  if (!args.source) {
    throw new LearningLoopError("performance_source_required");
  }
}
