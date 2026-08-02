// Run with: node --experimental-strip-types packages/hermes/src/__tests__/mock-adapter.test.ts
import assert from "node:assert/strict";
import { createMockHermesAdapter } from "../mock-adapter.ts";
import type { MissionScopedContext } from "../types.ts";
import type { MissionRow } from "@stratxcel/missions";

function fakeMission(): MissionRow {
  return {
    id: "mission-1",
    tenant_id: "tenant-1",
    created_by: null,
    goal_text: "test goal",
    service_key: "social_campaign",
    state: "RUNNING",
    estimated_cost_cents: 1000,
    hermes_profile: "stratxcel-content",
    hermes_run_id: null,
    brand_brain_version: 1,
    version: 1,
    idempotency_key: null,
    actual_cost_cents: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fakeContext(serviceKey: string | null): MissionScopedContext {
  return {
    missionId: "mission-1",
    tenantId: "tenant-1",
    goalText: "test goal",
    serviceKey,
    hermesProfile: "stratxcel-content",
    brandBrainVersion: 1,
    brandBrain: { business_name: "Test Co" },
    budgetCents: 1000,
    allowedTools: ["get_brand_context"],
  };
}

async function run() {
  const adapter = createMockHermesAdapter();
  assert.equal(adapter.mode, "mock");

  const health = await adapter.healthCheck();
  assert.equal(health.healthy, true);

  const matched = await adapter.execute(fakeMission(), fakeContext("social_campaign"), "fake-token");
  assert.equal(matched.outcome, "COMPLETED");
  assert.ok(matched.progressEvents && matched.progressEvents.length > 0);

  const unmatched = await adapter.execute(fakeMission(), fakeContext("custom_mission"), "fake-token");
  assert.equal(unmatched.outcome, "PARTIALLY_COMPLETED");

  const noService = await adapter.execute(fakeMission(), fakeContext(null), "fake-token");
  assert.equal(noService.outcome, "PARTIALLY_COMPLETED");

  await adapter.cancel("does-not-exist"); // must not throw

  console.log("mock-adapter.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
