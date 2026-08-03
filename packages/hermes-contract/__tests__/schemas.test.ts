// Smoke-tests the hermes-contract schemas: valid payloads parse, invalid
// ones reject. Not wired to any application code — see package README.
// Run with: node --experimental-strip-types packages/hermes-contract/__tests__/schemas.test.ts

import assert from "node:assert/strict";
import {
  ApprovalDecision,
  ApprovalRequest,
  ArtifactManifest,
  HermesExecutionEvent,
  MissionCancellation,
  MissionResume,
  RuntimeHealth,
  SubmitMissionRequest,
  SubmitMissionResponse,
  ToolRequest,
  ToolResult,
  UsageAndCost,
} from "../src/index.ts";

const MISSION_ID = "11111111-1111-4111-8111-111111111111";
const APPROVAL_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-08-04T00:00:00Z";

function run() {
  // SubmitMissionRequest: valid mission parses; unknown profile rejects
  const valid = SubmitMissionRequest.parse({
    missionId: MISSION_ID,
    idempotencyKey: "seo-report-2026-08-04",
    tenantId: "stratxcel-internal",
    profile: "seo",
    brief: "Analyse stratxcel.in and produce a read-only SEO/conversion report",
  });
  assert.equal(valid.profile, "seo");
  assert.deepEqual(valid.context, {});
  assert.throws(() =>
    SubmitMissionRequest.parse({
      missionId: MISSION_ID,
      idempotencyKey: "x",
      tenantId: "stratxcel-internal",
      profile: "not-a-real-profile",
      brief: "x",
    })
  );

  // SubmitMissionResponse
  const res = SubmitMissionResponse.parse({
    missionId: MISSION_ID,
    runId: "run_abc123",
    status: "accepted",
    acceptedAt: NOW,
  });
  assert.equal(res.status, "accepted");

  // ToolRequest / ToolResult: a brokered sensitive tool returns pending_approval
  const toolReq = ToolRequest.parse({
    callId: "call_1",
    name: "mcp_stratxcel_vercel_promote_production",
    arguments: { deploymentId: "dpl_123" },
    requestedAt: NOW,
  });
  assert.equal(toolReq.name, "mcp_stratxcel_vercel_promote_production");
  const toolResult = ToolResult.parse({
    callId: "call_1",
    name: "mcp_stratxcel_vercel_promote_production",
    status: "pending_approval",
    approvalRequestId: APPROVAL_ID,
    completedAt: NOW,
  });
  assert.equal(toolResult.status, "pending_approval");

  // HermesExecutionEvent discriminates by type
  const evt = HermesExecutionEvent.parse({
    type: "tool.completed",
    tenantId: "stratxcel-internal",
    missionId: MISSION_ID,
    runId: "run_abc123",
    sequence: 1,
    receivedVia: "sse",
    receivedAt: NOW,
    tool: {
      callId: "call_1",
      name: "web_search",
      status: "ok",
      output: { results: [] },
      completedAt: NOW,
    },
  });
  assert.equal(evt.type, "tool.completed");

  // ApprovalRequest / ApprovalDecision
  const approvalReq = ApprovalRequest.parse({
    approvalRequestId: APPROVAL_ID,
    tenantId: "stratxcel-internal",
    missionId: MISSION_ID,
    toolName: "mcp_stratxcel_vercel_promote_production",
    toolArguments: {},
    riskCategory: "production_deploy",
    summary: "Promote dpl_123 to production",
    requestedAt: NOW,
    status: "pending",
  });
  assert.equal(approvalReq.status, "pending");
  const decision = ApprovalDecision.parse({
    approvalRequestId: APPROVAL_ID,
    decision: "rejected",
    decidedBy: "user_1",
    decidedAt: NOW,
    reason: "Not ready",
  });
  assert.equal(decision.decision, "rejected");

  // ArtifactManifest: all three retrieval methods
  const manifest = ArtifactManifest.parse({
    missionId: MISSION_ID,
    generatedAt: NOW,
    artifacts: [
      {
        artifactId: ARTIFACT_ID,
        contentType: "text/markdown",
        sizeBytes: 42,
        sha256: "a".repeat(64),
        retrieval: { method: "inline", content: "# report" },
        label: "SEO report",
      },
      {
        artifactId: ARTIFACT_ID,
        contentType: "text/plain",
        sizeBytes: 1,
        sha256: "b".repeat(64),
        retrieval: { method: "hermes_file", workspacePath: "/workspace/out.txt" },
        label: "raw output",
      },
      {
        artifactId: ARTIFACT_ID,
        contentType: "text/uri-list",
        sizeBytes: 0,
        sha256: "c".repeat(64),
        retrieval: { method: "external_url", url: "https://example.vercel.app" },
        label: "Preview deployment",
      },
    ],
  });
  assert.equal(manifest.artifacts.length, 3);

  // MissionCancellation / MissionResume
  MissionCancellation.parse({
    missionId: MISSION_ID,
    runId: "run_abc123",
    requestedBy: "user_1",
    requestedAt: NOW,
  });
  const resume = MissionResume.parse({
    kind: "approval_resume",
    missionId: MISSION_ID,
    runId: "run_abc123",
    approvalRequestId: APPROVAL_ID,
  });
  assert.equal(resume.kind, "approval_resume");

  // RuntimeHealth / UsageAndCost
  const health = RuntimeHealth.parse({ status: "ok", checkedAt: NOW });
  assert.equal(health.status, "ok");
  const usage = UsageAndCost.parse({
    missionId: MISSION_ID,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    model: "hermes-agent",
    provider: "nous",
  });
  assert.equal(usage.totalTokens, 150);

  console.log(
    "schemas.test.ts: ALL PASS (mission, tools, events, approval, artifact, resume/cancel, runtime)"
  );
}

run();
