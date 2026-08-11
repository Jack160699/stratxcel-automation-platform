// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/handoff-budget.test.ts
import assert from "node:assert/strict";
import { createDepartmentHandoff } from "../handoffs/create.ts";
import {
  allocateChildBudget,
  createMissionBudget,
  BudgetEscalationError,
  remainingBudget,
} from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { planThirtyDayGrowth, reviseThirtyDayPlan } from "../planning/thirty-day-planner.ts";
import type { ThirtyDayPlannerInput } from "../planning/types.ts";

function run() {
  const handoff = createDepartmentHandoff({
    tenantId: "tenant-1",
    missionId: "mission-1",
    planId: "plan-1",
    fromStage: "s_research",
    toStage: "s_strategy",
    objective: "Hand off audience evidence to strategy",
    artifactIds: ["artifact-research-1"],
    evidenceIds: ["evidence-1"],
    decisions: ["Prioritize local homeowners segment"],
    unresolvedQuestions: ["Competitor pricing depth"],
    constraints: ["Fixed 8 image + 4 reel envelope"],
    qualityStatus: "PASS",
  });

  assert.equal(handoff.fromStage, "s_research");
  assert.equal(handoff.toStage, "s_strategy");
  assert.throws(
    () =>
      createDepartmentHandoff({
        tenantId: "tenant-1",
        missionId: "mission-1",
        planId: "plan-1",
        fromStage: "s_research",
        toStage: "s_research",
        objective: "invalid",
        artifactIds: [],
        evidenceIds: [],
        decisions: [],
        unresolvedQuestions: [],
        constraints: [],
        qualityStatus: "not_reviewed",
      }),
    /handoff_same_stage/,
  );

  const missionBudget = createMissionBudget(10_000);
  allocateChildBudget(missionBudget, 3000, 0);
  allocateChildBudget(missionBudget, 4000, 3000);
  assert.throws(() => allocateChildBudget(missionBudget, 5000, 6000), BudgetEscalationError);
  assert.equal(remainingBudget({ ...missionBudget, actualCents: 2000 }), 8000);

  const input: ThirtyDayPlannerInput = {
    tenantId: "tenant-1",
    missionId: "mission-1",
    timezone: "Asia/Kolkata",
    currentDateIso: "2026-08-11T00:00:00.000Z",
    brandBrain: { business_name: "Handoff Test Co", industry: "services" },
    productsServices: [],
    targetAudience: "local",
    geography: "City",
    positioning: "Trusted local brand",
    connectedChannels: ["Instagram"],
    businessGoals: ["Grow leads"],
    previousPerformance: [],
    existingResearchEvidence: [],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "FIXED_COMPOSITION",
      packageComposition: [
        { mediaType: "image", quantity: 8 },
        { mediaType: "reel", quantity: 4 },
      ],
      relevantEntitlements: { social_posts: 12 },
    }),
    budgetEnvelope: createMissionBudget(50000),
  };

  const v1 = planThirtyDayGrowth(input);
  const v2 = reviseThirtyDayPlan(v1, {
    revisionReason: "Week-2 engagement learning applied",
    evidenceIds: ["analytics-evidence-1"],
    proposedByDepartment: "analytics",
    patch: { messagingThemes: [...v1.messagingThemes, "Social proof from recent projects"] },
  });

  assert.equal(v2.version, 2);
  assert.equal(v2.workforcePlan.previousPlanId, v1.workforcePlan.id);
  assert.equal(v2.planningContext.brandBrain.business_name, "Handoff Test Co");
  assert.equal(v2.planningContext.timezone, "Asia/Kolkata");
  assert.throws(
    () =>
      reviseThirtyDayPlan(v1, {
        revisionReason: "No evidence",
        evidenceIds: [],
        proposedByDepartment: "analytics",
        patch: {},
      }),
    /revision_requires_evidence/,
  );

  console.log("handoff-budget.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
