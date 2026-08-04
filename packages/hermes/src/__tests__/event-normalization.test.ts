// Run with: node --experimental-strip-types packages/hermes/src/__tests__/event-normalization.test.ts
import assert from "node:assert/strict";
import { normalizeHermesEvent } from "../event-normalization.ts";
import type { HermesExecutionEvent } from "@stratxcel/hermes-contract";

const BASE = {
  tenantId: "tenant-1",
  missionId: "550e8400-e29b-41d4-a716-446655440000",
  runId: "run-1",
  receivedVia: "sse" as const,
  receivedAt: "2026-08-04T00:00:00Z",
};

function run() {
  // message.delta -> assistant.progress
  const delta: HermesExecutionEvent = { ...BASE, type: "message.delta", sequence: 0, textDelta: "hello" };
  assert.deepEqual(
    normalizeHermesEvent(delta).map((e) => e.type),
    ["assistant.progress"]
  );

  // tool.started against the clarify tool also emits awaiting_input
  const clarifyStarted: HermesExecutionEvent = {
    ...BASE,
    type: "tool.started",
    sequence: 1,
    tool: { callId: "c1", name: "clarify", arguments: { question: "which platform?" }, requestedAt: BASE.receivedAt },
  };
  assert.deepEqual(
    normalizeHermesEvent(clarifyStarted).map((e) => e.type),
    ["tool.started", "awaiting_input"]
  );

  // a plain tool.started does not
  const plainStarted: HermesExecutionEvent = {
    ...BASE,
    type: "tool.started",
    sequence: 2,
    tool: { callId: "c2", name: "web_search", arguments: { query: "x" }, requestedAt: BASE.receivedAt },
  };
  assert.deepEqual(
    normalizeHermesEvent(plainStarted).map((e) => e.type),
    ["tool.started"]
  );

  // tool.completed on an artifact-shaped tool name also emits artifact.created
  const artifactCompleted: HermesExecutionEvent = {
    ...BASE,
    type: "tool.completed",
    sequence: 3,
    tool: { callId: "c3", name: "mcp_stratxcel_content_draft_save", status: "ok", output: {}, completedAt: BASE.receivedAt },
  };
  assert.deepEqual(
    normalizeHermesEvent(artifactCompleted).map((e) => e.type),
    ["tool.completed", "artifact.created"]
  );

  // a failed artifact-shaped tool.completed does NOT emit artifact.created
  const artifactFailed: HermesExecutionEvent = {
    ...BASE,
    type: "tool.completed",
    sequence: 4,
    tool: { callId: "c4", name: "mcp_stratxcel_content_draft_save", status: "error", errorMessage: "boom", completedAt: BASE.receivedAt },
  };
  assert.deepEqual(
    normalizeHermesEvent(artifactFailed).map((e) => e.type),
    ["tool.completed"]
  );

  // human handoff tool completion
  const handoffCompleted: HermesExecutionEvent = {
    ...BASE,
    type: "tool.completed",
    sequence: 5,
    tool: { callId: "c5", name: "create_human_handoff", status: "ok", output: {}, completedAt: BASE.receivedAt },
  };
  assert.deepEqual(
    normalizeHermesEvent(handoffCompleted).map((e) => e.type),
    ["tool.completed", "human.handoff"]
  );

  // approval.request -> approval.required, carrying through the id
  const approvalReq: HermesExecutionEvent = { ...BASE, type: "approval.request", sequence: 6, approvalRequestId: "550e8400-e29b-41d4-a716-446655440099", toolName: "submit_publish_request" };
  const approvalNormalized = normalizeHermesEvent(approvalReq);
  assert.equal(approvalNormalized.length, 1);
  assert.equal(approvalNormalized[0].type, "approval.required");
  assert.equal(approvalNormalized[0].payload.approvalRequestId, "550e8400-e29b-41d4-a716-446655440099");

  // subagent.complete maps to task.completed or task.failed depending on status
  const subOk: HermesExecutionEvent = { ...BASE, type: "subagent.complete", sequence: 7, subagentRunId: "run-2", status: "completed" };
  assert.equal(normalizeHermesEvent(subOk)[0].type, "task.completed");
  const subFailed: HermesExecutionEvent = { ...BASE, type: "subagent.complete", sequence: 8, subagentRunId: "run-2", status: "failed" };
  assert.equal(normalizeHermesEvent(subFailed)[0].type, "task.failed");

  // terminal run events
  assert.equal(normalizeHermesEvent({ ...BASE, type: "run.completed", sequence: 9 })[0].type, "mission.completed");
  assert.equal(normalizeHermesEvent({ ...BASE, type: "run.failed", sequence: 10, error: "oops" })[0].type, "mission.failed");
  assert.equal(normalizeHermesEvent({ ...BASE, type: "run.cancelled", sequence: 11 })[0].type, "mission.cancelled");

  // sequence, tenantId, missionId, runId pass through unchanged (idempotency-relevant)
  const passthrough = normalizeHermesEvent(delta)[0];
  assert.equal(passthrough.sequence, 0);
  assert.equal(passthrough.tenantId, "tenant-1");
  assert.equal(passthrough.missionId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(passthrough.runId, "run-1");

  // purity: calling twice on the same input gives identical output
  assert.deepEqual(normalizeHermesEvent(delta), normalizeHermesEvent(delta));

  console.log("event-normalization.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
