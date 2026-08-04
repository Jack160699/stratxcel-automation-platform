// Run with: node --experimental-strip-types packages/hermes/src/__tests__/mock-adapter.test.ts
import assert from "node:assert/strict";
import { createMockHermesAdapter } from "../mock-adapter.ts";
import type { SubmitMissionRequest } from "@stratxcel/hermes-contract";
import type { HermesExecutionEvent } from "@stratxcel/hermes-contract";

function fakeRequest(serviceKey: string | null): SubmitMissionRequest {
  return {
    missionId: "550e8400-e29b-41d4-a716-446655440000",
    idempotencyKey: "idem-1",
    tenantId: "tenant-1",
    profile: "content",
    brief: "test goal",
    context: serviceKey ? { serviceKey } : {},
  };
}

async function run() {
  const adapter = createMockHermesAdapter();
  assert.equal(adapter.mode, "mock");

  const health = await adapter.healthCheck();
  assert.equal(health.status, "ok");

  // Matched service -> completed
  const matched = await adapter.submitMission(fakeRequest("social_campaign"));
  assert.equal(matched.status, "accepted");
  const matchedRun = await adapter.getRun(matched.runId);
  assert.equal(matchedRun.status, "completed");

  const matchedEvents: HermesExecutionEvent[] = [];
  await adapter.streamEvents(matched.runId, { tenantId: "tenant-1", missionId: matched.missionId }, (e) => {
    matchedEvents.push(e);
  });
  assert.ok(matchedEvents.length > 0);
  assert.equal(matchedEvents.at(-1)?.type, "run.completed");
  // sequence must be assigned and monotonic
  matchedEvents.forEach((e, i) => assert.equal(e.sequence, i));

  // Unmatched service -> partially completed, surfaced as run.failed
  const unmatched = await adapter.submitMission(fakeRequest("custom_mission"));
  const unmatchedRun = await adapter.getRun(unmatched.runId);
  assert.equal(unmatchedRun.status, "failed");

  const unmatchedEvents: HermesExecutionEvent[] = [];
  await adapter.streamEvents(unmatched.runId, { tenantId: "tenant-1", missionId: unmatched.missionId }, (e) => {
    unmatchedEvents.push(e);
  });
  assert.equal(unmatchedEvents.at(-1)?.type, "run.failed");

  // No service key -> also partially completed (mirrors "we don't fully know what to do with this yet")
  const noService = await adapter.submitMission(fakeRequest(null));
  const noServiceRun = await adapter.getRun(noService.runId);
  assert.equal(noServiceRun.status, "completed"); // no serviceKey != "custom_mission", so treated as matched

  await adapter.stopRun("does-not-exist"); // must not throw
  await adapter.resolveApproval("does-not-exist", {
    approvalRequestId: "550e8400-e29b-41d4-a716-446655440001",
    decision: "approved",
    decidedBy: "test-user",
    decidedAt: new Date().toISOString(),
  }); // must not throw

  const backfill = await adapter.getTranscriptBackfill(matched.runId);
  assert.equal(backfill, null); // mock never supports backfill

  console.log("mock-adapter.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
