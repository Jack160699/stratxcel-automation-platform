import { assertRole } from "../../roles/registry.ts";
import { createDepartmentHandoff, type DepartmentHandoff } from "../../handoffs/create.ts";
import type { DepartmentKey } from "../../departments/types.ts";
import type { GrowthStrategyArtifact, IntelligenceBottleneckGraph, ResearchPlanArtifact } from "../types.ts";

export interface IntelligenceSpecialistStage {
  stageId: string;
  department: DepartmentKey;
  specialistRole: string;
  parallelGroup: number;
  creatorRole: string;
  reviewerRole?: string;
  objective: string;
}

export interface IntelligenceSpecialistRunPlan {
  id: string;
  tenantId: string;
  missionId: string;
  stages: readonly IntelligenceSpecialistStage[];
  reviewerSeparationEnforced: true;
}

export const HERMES_INTELLIGENCE_DELEGATION_GUIDANCE = `Intelligence Department delegation: run research roles in parallel (market, audience, competitor, trend), then evidence_reviewer (must differ from creators), then growth_strategist, brand_strategist, and final_reviewer. Never let the same role both create and approve customer-facing audit claims. Route response bottlenecks to CRM/WhatsApp — not Social. Recommendations must not mutate billing.`;

const RESEARCH = ["market_researcher", "audience_researcher", "competitor_researcher", "trend_researcher"] as const;

export function buildIntelligenceSpecialistRunPlan(args: {
  tenantId: string; missionId: string; researchPlan: ResearchPlanArtifact; strategy: GrowthStrategyArtifact;
}): IntelligenceSpecialistRunPlan {
  const stages: IntelligenceSpecialistStage[] = [];
  let n = 0;
  for (const role of RESEARCH) {
    assertRole("research", role);
    stages.push({ stageId: `intel_${++n}`, department: "research", specialistRole: role, parallelGroup: 1, creatorRole: role, objective: args.researchPlan.tasks.find((t) => t.specialistRole === role)?.objective ?? role });
  }
  assertRole("research", "evidence_reviewer");
  stages.push({ stageId: `intel_${++n}`, department: "research", specialistRole: "evidence_reviewer", parallelGroup: 2, creatorRole: "evidence_reviewer", reviewerRole: "market_researcher", objective: "Validate evidence quality" });
  assertRole("strategy", "growth_strategist");
  stages.push({ stageId: `intel_${++n}`, department: "strategy", specialistRole: "growth_strategist", parallelGroup: 3, creatorRole: "growth_strategist", reviewerRole: "evidence_reviewer", objective: args.strategy.businessObjective });
  assertRole("brand", "brand_strategist");
  stages.push({ stageId: `intel_${++n}`, department: "brand", specialistRole: "brand_strategist", parallelGroup: 4, creatorRole: "brand_strategist", reviewerRole: "growth_strategist", objective: "Brand-aligned strategy framing" });
  assertRole("quality", "final_reviewer");
  stages.push({ stageId: `intel_${++n}`, department: "quality", specialistRole: "final_reviewer", parallelGroup: 5, creatorRole: "report_writer", reviewerRole: "final_reviewer", objective: "Independent final review" });
  return { id: `intel_plan_${args.missionId}`, tenantId: args.tenantId, missionId: args.missionId, stages, reviewerSeparationEnforced: true };
}

export function buildIntelligenceHandoffs(args: {
  tenantId: string; missionId: string; planId: string; strategy: GrowthStrategyArtifact; bottleneckGraph: IntelligenceBottleneckGraph;
}): DepartmentHandoff[] {
  const depts = [...new Set(args.strategy.workItems.map((w) => w.department))];
  return depts.map((dept, i) => createDepartmentHandoff({
    tenantId: args.tenantId, missionId: args.missionId, planId: args.planId,
    fromStage: "intelligence_complete", toStage: `${dept}_execution`,
    objective: `Execute ${dept} work items from intelligence strategy`,
    artifactIds: [args.strategy.id], evidenceIds: args.bottleneckGraph.bottlenecks.flatMap((b) => [...b.evidenceIds]),
    decisions: [args.strategy.businessObjective], unresolvedQuestions: [], constraints: ["Do not mutate billing from recommendations"],
    qualityStatus: "PASS",
  }));
}
