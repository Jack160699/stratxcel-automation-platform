// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/hermes-ceo.test.ts
import assert from "node:assert/strict";
import type { HermesRuntimeAdapter } from "@stratxcel/hermes";
import type { MissionRow } from "@stratxcel/missions";
import {
  parseCeoPlanProposal,
  compileHermesCeoPlan,
  HERMES_CEO_INSTRUCTIONS,
  assertBudgetNarrowing,
} from "../execution/ceo.ts";
import { CapabilityEscalationError } from "../security/narrowing.ts";
import { createMissionBudget, BudgetEscalationError } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { runSpecialistAgent } from "../execution/specialist-runner.ts";

function fakeMission(): MissionRow {
  return {
    id: "mission-1",
    tenant_id: "tenant-1",
    created_by: null,
    goal_text: "CEO test",
    service_key: "social_campaign",
    state: "RUNNING",
    estimated_cost_cents: 5000,
    hermes_profile: "stratxcel-orchestrator",
    hermes_run_id: null,
    brand_brain_version: 1,
    version: 1,
    idempotency_key: null,
    actual_cost_cents: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function runAsync() {
  assert.ok(HERMES_CEO_INSTRUCTIONS.includes("CEO"));

  const valid = parseCeoPlanProposal({
    objective: "Launch social campaign",
    businessOutcome: "More qualified leads",
    departmentStages: [
      {
        stageId: "s_content",
        department: "content",
        specialistRole: "copywriter",
        objective: "Write captions",
        dependencies: [],
        outputKind: "caption_set",
        allowedCapabilityClasses: ["content.shortform"],
        budgetCents: 300,
      },
    ],
  });
  assert.equal(valid.departmentStages.length, 1);

  assert.throws(() => parseCeoPlanProposal({ objective: "x" }), /Invalid input|Required/);

  const plan = compileHermesCeoPlan({
    tenantId: "tenant-1",
    missionId: "mission-1",
    proposal: valid,
    entitlementSnapshot: snapshotFromContract({
      allocationPolicy: "FIXED_COMPOSITION",
      packageComposition: [{ mediaType: "image", quantity: 8 }],
      relevantEntitlements: { social_posts: 8 },
    }),
    capabilitySnapshot: ["content.shortform"],
    budgetEnvelope: createMissionBudget(5000),
    parentAllowedTools: ["get_brand_context", "create_draft_artifact"],
    parentAllowedCapabilities: ["content.shortform"],
    parentBudgetRemainingCents: 5000,
    createdAtIso: new Date().toISOString(),
  });
  assert.equal(plan.status, "VALIDATING");
  // content.shortform is NOT_CONFIGURED — CEO must park stage as WAITING_CAPABILITY
  assert.equal(plan.departmentStages[0]!.state, "WAITING_CAPABILITY");

  assert.throws(
    () =>
      compileHermesCeoPlan({
        tenantId: "tenant-1",
        missionId: "mission-1",
        proposal: {
          ...valid,
          departmentStages: [
            {
              ...valid.departmentStages[0]!,
              allowedCapabilityClasses: ["social.publish"],
            },
          ],
        },
        entitlementSnapshot: snapshotFromContract({
          allocationPolicy: "FIXED_COMPOSITION",
          packageComposition: [],
          relevantEntitlements: {},
        }),
        capabilitySnapshot: ["content.shortform"],
        budgetEnvelope: createMissionBudget(5000),
        parentAllowedTools: ["get_brand_context"],
        parentAllowedCapabilities: ["content.shortform"],
        parentBudgetRemainingCents: 5000,
        createdAtIso: new Date().toISOString(),
      }),
    CapabilityEscalationError,
  );

  assert.throws(() => assertBudgetNarrowing(100, 500), BudgetEscalationError);

  const hermes: HermesRuntimeAdapter = {
    mode: "mock",
    healthCheck: async () => ({ healthy: true, mode: "mock" }),
    execute: async () => ({
      outcome: "COMPLETED",
      summary: "mock ok",
      hermesRunId: "run-1",
    }),
    cancel: async () => {},
  };

  const success = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-1",
      department: "content",
      role: "copywriter",
      objective: "Write captions",
      instructions: "Draft copy",
      inputArtifactIds: [],
      allowedTools: ["get_brand_context", "create_draft_artifact"],
      budgetCents: 300,
      outputContract: { kind: "caption_set" },
      evidenceRequirements: [],
      parentAllowedTools: ["get_brand_context", "create_draft_artifact"],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-ceo-1",
    },
    {
      getMission: async () => fakeMission(),
      getArtifacts: async () => [],
      hermes,
      issueToken: () => "token",
      buildContext: ({ instructions }) => ({
        missionId: "mission-1",
        tenantId: "tenant-1",
        goalText: instructions,
        serviceKey: "social_campaign",
        hermesProfile: "stratxcel-orchestrator",
        brandBrainVersion: 1,
        brandBrain: { business_name: "Test" },
        budgetCents: 300,
        allowedTools: ["get_brand_context", "create_draft_artifact"],
      }),
      brandBrainForMission: async () => ({ business_name: "Test" }),
    },
  );
  assert.equal(success.status, "COMPLETED");

  const timeoutHermes: HermesRuntimeAdapter = {
    ...hermes,
    execute: async () => ({ outcome: "FAILED", summary: "timeout" }),
  };
  const failed = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-1",
      department: "content",
      role: "copywriter",
      objective: "Write captions",
      instructions: "Draft copy",
      inputArtifactIds: [],
      allowedTools: ["get_brand_context"],
      budgetCents: 100,
      outputContract: { kind: "caption_set" },
      evidenceRequirements: [],
      parentAllowedTools: ["get_brand_context"],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-ceo-2",
    },
    {
      getMission: async () => fakeMission(),
      getArtifacts: async () => [],
      hermes: timeoutHermes,
      issueToken: () => "token",
      buildContext: ({ instructions }) => ({
        missionId: "mission-1",
        tenantId: "tenant-1",
        goalText: instructions,
        serviceKey: "social_campaign",
        hermesProfile: "stratxcel-orchestrator",
        brandBrainVersion: 1,
        brandBrain: null,
        budgetCents: 100,
        allowedTools: ["get_brand_context"],
      }),
      brandBrainForMission: async () => ({}),
    },
  );
  assert.equal(failed.status, "FAILED");

  console.log("hermes-ceo.test.ts (@stratxcel/workforce-core): ALL PASS");
}

runAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
