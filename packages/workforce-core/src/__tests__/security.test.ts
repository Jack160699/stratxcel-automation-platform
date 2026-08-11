// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/security.test.ts
import assert from "node:assert/strict";
import type { HermesRuntimeAdapter } from "@stratxcel/hermes";
import type { MissionRow } from "@stratxcel/missions";
import { runSpecialistAgent } from "../execution/specialist-runner.ts";
import { allocateChildBudget, BudgetEscalationError } from "../budgets/hierarchy.ts";
import {
  assertNoExternalMutationFromPlanAlone,
  assertTrustedScope,
  CapabilityEscalationError,
  narrowCapabilityClasses,
  narrowTools,
  SecurityValidationError,
} from "../security/narrowing.ts";

function fakeMission(overrides: Partial<MissionRow> = {}): MissionRow {
  return {
    id: "mission-1",
    tenant_id: "tenant-trusted",
    created_by: null,
    goal_text: "Security test mission",
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
    ...overrides,
  };
}

function mockDeps(overrides: Partial<Parameters<typeof runSpecialistAgent>[1]> = {}) {
  const hermes: HermesRuntimeAdapter = {
    mode: "mock",
    healthCheck: async () => ({ healthy: true, mode: "mock" }),
    execute: async () => ({
      outcome: "COMPLETED" as const,
      summary: "mock completed",
      hermesRunId: "run-mock-1",
      progressEvents: [],
    }),
    cancel: async () => {},
    ...((overrides.hermes as HermesRuntimeAdapter | undefined) ?? {}),
  };

  return {
    getMission: async () => fakeMission(),
    getArtifacts: async (ids: readonly string[]) =>
      ids.map((id) => ({
        id,
        tenantId: "tenant-trusted",
        missionId: "mission-1",
        kind: "research_summary",
      })),
    hermes,
    issueToken: () => "mock-token-no-secret",
    buildContext: ({ instructions }: { instructions: string }) => ({
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      goalText: instructions,
      serviceKey: "social_campaign",
      hermesProfile: "stratxcel-orchestrator",
      brandBrainVersion: 1,
      brandBrain: { business_name: "Test Co" },
      budgetCents: 500,
      allowedTools: ["get_brand_context"] as import("@stratxcel/hermes").ToolName[],
    }),
    brandBrainForMission: async () => ({ business_name: "Test Co" }),
    ...overrides,
  } as import("../execution/specialist-runner.ts").SpecialistRunnerDeps;
}

async function runAsync() {
  const parentTools = ["get_brand_context", "create_draft_artifact", "attach_research_evidence"] as const;
  const parentCaps = ["content.shortform", "research.web", "media.image_generation"];

  const crossTenant = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      department: "research",
      role: "audience_researcher",
      objective: "Research audience",
      instructions: "Gather evidence",
      inputArtifactIds: ["artifact-other-tenant"],
      allowedTools: ["get_brand_context"],
      budgetCents: 500,
      outputContract: { kind: "research_summary" },
      evidenceRequirements: [],
      parentAllowedTools: [...parentTools],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-1",
    },
    mockDeps({
      getArtifacts: async () => [
        { id: "artifact-other-tenant", tenantId: "tenant-evil", missionId: "mission-1", kind: "research_summary" },
      ],
    }),
  );
  assert.equal(crossTenant.status, "FAILED");
  assert.equal(crossTenant.errorCode, "cross_tenant_artifact_rejected");

  const forgedDept = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      department: "fake_department",
      role: "audience_researcher",
      objective: "test",
      instructions: "test",
      inputArtifactIds: [],
      allowedTools: ["get_brand_context"],
      budgetCents: 100,
      outputContract: { kind: "research_summary" },
      evidenceRequirements: [],
      parentAllowedTools: [...parentTools],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-forged-dept",
    },
    mockDeps(),
  );
  assert.equal(forgedDept.status, "FAILED");

  const forgedRole = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      department: "research",
      role: "fake_role",
      objective: "test",
      instructions: "test",
      inputArtifactIds: [],
      allowedTools: ["get_brand_context"],
      budgetCents: 100,
      outputContract: { kind: "research_summary" },
      evidenceRequirements: [],
      parentAllowedTools: [...parentTools],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-forged-role",
    },
    mockDeps(),
  );
  assert.equal(forgedRole.status, "FAILED");

  assert.throws(() => narrowCapabilityClasses(parentCaps, ["social.publish"]), CapabilityEscalationError);
  assert.throws(
    () => allocateChildBudget({ estimatedCents: null, reservedCents: 1000, actualCents: null }, 800, 300),
    BudgetEscalationError,
  );
  assert.throws(
    () => narrowTools([...parentTools], ["social.publish" as never]),
    /Child tool escalation rejected: social\.publish/,
  );
  assert.throws(
    () => narrowCapabilityClasses([...parentCaps, "ads.nuclear_launch"], ["ads.nuclear_launch"]),
    (err: unknown) => err instanceof SecurityValidationError && err.code === "unknown_capability",
  );
  assert.throws(
    () => assertNoExternalMutationFromPlanAlone("social.publish", false),
    (err: unknown) => err instanceof SecurityValidationError && err.code === "external_mutation_not_authorized",
  );
  assert.throws(
    () =>
      assertTrustedScope({
        trustedTenantId: "tenant-a",
        requestTenantId: "tenant-b",
        departmentExists: true,
        roleExists: true,
      }),
    (err: unknown) => err instanceof SecurityValidationError && err.code === "tenant_mismatch",
  );

  const unavailableMedia = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      department: "media",
      role: "video_producer",
      objective: "Produce reel",
      instructions: "Generate video",
      inputArtifactIds: [],
      allowedTools: ["create_draft_artifact"],
      budgetCents: 500,
      outputContract: { kind: "reel_candidate" },
      evidenceRequirements: [],
      parentAllowedTools: [...parentTools, "create_draft_artifact"],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-media",
      requiredCapabilities: ["media.video_generation"],
    },
    mockDeps(),
  );
  assert.equal(unavailableMedia.status, "FAILED");
  assert.equal(unavailableMedia.errorCode, "unavailable_media_provider");

  const success = await runSpecialistAgent(
    {
      missionId: "mission-1",
      tenantId: "tenant-trusted",
      department: "content",
      role: "copywriter",
      objective: "Write captions",
      instructions: "Draft copy",
      inputArtifactIds: [],
      allowedTools: ["get_brand_context", "create_draft_artifact"],
      budgetCents: 300,
      outputContract: { kind: "caption_set" },
      evidenceRequirements: [],
      parentAllowedTools: [...parentTools, "create_draft_artifact"],
      parentBudgetRemainingCents: 5000,
      correlationId: "corr-success",
    },
    mockDeps(),
  );
  assert.equal(success.status, "COMPLETED");

  console.log("security.test.ts (@stratxcel/workforce-core): ALL PASS");
}

runAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
