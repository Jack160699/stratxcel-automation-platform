import { buildGrowthRecommendations } from "../planning/recommendations.ts";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { buildResearchPlan } from "./research/planner.ts";
import { synthesizeResearchFindings } from "./research/synthesis.ts";
import { assessBrandReadiness } from "./brand/readiness.ts";
import { runIntelligenceDiagnosis } from "./diagnosis/engine.ts";
import { deriveIntelligenceBottlenecks } from "./bottlenecks/engine.ts";
import { buildGrowthStrategyArtifact, assertObjectiveDistinctFromTactics, assertResponseBottlenecksNotRoutedToSocial } from "./strategy/builder.ts";
import { finalizeCommercialFit } from "./recommendations/commercial-fit.ts";
import { finalizeCustomerAudit } from "./audit/artifact.ts";
import { buildIntelligenceHandoffs, buildIntelligenceSpecialistRunPlan } from "./hermes/delegation.ts";
import { emitIntelligenceEvent, type IntelligenceEvent } from "./events.ts";
import { assertBrandBrainTenant, assertTenantScopedEvidence } from "./security.ts";
import { buildCatalogueFromPlanDefinitions } from "./catalogue.ts";
import type { IntelligencePipelineContext, IntelligencePipelineResult } from "./types.ts";

export function runIntelligencePipeline(ctx: IntelligencePipelineContext): IntelligencePipelineResult {
  assertBrandBrainTenant({ tenantId: ctx.tenantId, brandBrainTenantId: ctx.brandBrainTenantId ?? ctx.tenantId });
  const evidenceRecords = assertTenantScopedEvidence(ctx.evidenceRecords ?? [], { tenantId: ctx.tenantId, missionId: ctx.missionId });
  const events: IntelligenceEvent[] = [];
  const push = (name: IntelligenceEvent["name"], data?: Record<string, unknown>) => {
    events.push(emitIntelligenceEvent({ name, atIso: ctx.currentDateIso, payload: { tenantId: ctx.tenantId, missionId: ctx.missionId, data } }));
  };

  const plannerInput = { ...ctx.plannerInput, tenantId: ctx.tenantId, missionId: ctx.missionId, budgetEnvelope: ctx.plannerInput.budgetEnvelope ?? createMissionBudget(0) };
  const diagnosisPreview = runIntelligenceDiagnosis({ plannerInput, evidenceRecords, brandBrainTenantId: ctx.brandBrainTenantId });
  push("intelligence.research.started");
  const researchPlan = buildResearchPlan({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, plannerInput, researchGaps: diagnosisPreview.diagnosis.researchGaps, budgetCents: ctx.researchBudgetCents ?? 0 });
  push("intelligence.research.completed", { taskCount: researchPlan.tasks.length });
  const synthesis = synthesizeResearchFindings({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, plan: researchPlan, evidenceRecords, gapStatements: diagnosisPreview.diagnosis.researchGaps });
  push("intelligence.evidence.reviewed", { claimCount: synthesis.claims.length });
  const brandReadiness = assessBrandReadiness(plannerInput.brandBrain);
  const diagnosis = runIntelligenceDiagnosis({ plannerInput, evidenceRecords, brandBrainTenantId: ctx.brandBrainTenantId });
  push("intelligence.diagnosis.completed", { entryMode: diagnosis.entryMode, maturity: diagnosis.maturity });
  const bottleneckGraph = deriveIntelligenceBottlenecks(diagnosis);
  push("intelligence.bottleneck.identified", { count: bottleneckGraph.bottlenecks.length });
  const recommendations = buildGrowthRecommendations({ bottlenecks: bottleneckGraph.bottlenecks, entitlementSnapshot: plannerInput.entitlementSnapshot });
  push("intelligence.recommendation.created", { count: recommendations.length });
  const catalogue = ctx.catalogue ?? buildCatalogueFromPlanDefinitions([]);
  const commercialFit = finalizeCommercialFit({ bottlenecks: bottleneckGraph.bottlenecks, catalogue, entitlementSnapshot: plannerInput.entitlementSnapshot });
  const strategy = buildGrowthStrategyArtifact({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, diagnosis, bottleneckGraph, recommendations, entitlementSnapshot: plannerInput.entitlementSnapshot, entryMode: diagnosis.entryMode });
  assertObjectiveDistinctFromTactics(strategy); assertResponseBottlenecksNotRoutedToSocial(strategy);
  push("intelligence.strategy.completed", { workItems: strategy.workItems.length });
  const audit = finalizeCustomerAudit({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, diagnosis, bottleneckGraph, strategy, recommendations, commercialFit });
  push("intelligence.audit.completed", { auditId: audit.id });
  const specialistPlan = buildIntelligenceSpecialistRunPlan({ tenantId: ctx.tenantId, missionId: ctx.missionId, researchPlan, strategy });
  const handoffs = buildIntelligenceHandoffs({ tenantId: ctx.tenantId, missionId: ctx.missionId, planId: strategy.id, strategy, bottleneckGraph });
  return { researchPlan, synthesis, brandReadiness, diagnosis, bottleneckGraph, recommendations, commercialFit, strategy, audit, specialistPlan, handoffs, events };
}
