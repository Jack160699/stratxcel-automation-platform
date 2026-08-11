import { createMissionBudget } from "../../budgets/hierarchy.ts";
import { getCapability } from "../../capabilities/registry.ts";
import { assertRole } from "../../roles/registry.ts";
import type { BusinessGrowthPlannerInput } from "../../planning/types.ts";
import type { ResearchPlanArtifact, ResearchTaskSpec } from "../types.ts";

const ROLES = ["market_researcher", "audience_researcher", "competitor_researcher", "trend_researcher", "evidence_reviewer"] as const;

export interface ResearchPlannerInput {
  tenantId: string; missionId: string; currentDateIso: string;
  plannerInput: Pick<BusinessGrowthPlannerInput, "brandBrain" | "targetAudience" | "geography" | "positioning" | "productsServices" | "businessGoals" | "existingResearchEvidence" | "businessSignals">;
  researchGaps: readonly string[]; budgetCents?: number;
}

function task(id: string, role: (typeof ROLES)[number], objective: string, cap: string, budget: number): ResearchTaskSpec {
  assertRole("research", role);
  const status = getCapability(cap)?.status ?? "UNAVAILABLE";
  return { taskId: id, department: "research", specialistRole: role, objective, questions: [objective], requiredCapability: cap, capabilityStatus: status, budgetCents: budget, evidenceOutputClass: "research_evidence" };
}

export function buildResearchPlan(input: ResearchPlannerInput): ResearchPlanArtifact {
  for (const r of ROLES) assertRole("research", r);
  const budgetEnvelope = createMissionBudget(input.budgetCents ?? 0);
  const each = Math.max(0, Math.floor((input.budgetCents ?? 0) / ROLES.length));
  const brand = input.plannerInput.brandBrain.business_name ?? "business";
  return {
    id: `research_plan_${input.missionId}`, tenantId: input.tenantId, missionId: input.missionId,
    tasks: [
      task("rt_1", "market_researcher", `Map market for ${brand}`, "research.web", each),
      task("rt_2", "audience_researcher", `Profile ${input.plannerInput.targetAudience}`, "research.web", each),
      task("rt_3", "competitor_researcher", "Competitor positioning", "research.serp", each),
      task("rt_4", "trend_researcher", "Trend scan", "research.web", each),
      task("rt_5", "evidence_reviewer", "Evidence QA", "research.web", each),
    ],
    budgetEnvelope,
    synthesisObjective: "Evidence-backed claims only — PLANNED capabilities, no live provider calls here",
    generatedAtIso: input.currentDateIso,
  };
}
