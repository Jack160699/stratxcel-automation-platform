/**
 * Master Security Hard Test & Negative Failure Recovery Suite
 * StratXcel Automation Platform - Hermes Universal OS
 *
 * Verifies all negative security boundaries (Section 17) and failure recovery hard tests (Section 20).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createNormalizedAttachment,
  generateSignedAttachmentUrl,
  ensureTenantAttachmentAccess,
  validateAttachment,
} from "@stratxcel/hermes";

import {
  generateAntiReplayConfirmation,
  consumeAntiReplayConfirmation,
  verifyAgentChannelRequest,
} from "@stratxcel/agent-core";

import {
  createAutonomousAgent,
  deployAgent,
  checkAgentExecutionQuota,
  evaluateAgentHealthAndSelfHeal,
  executeCoreMcpCapability,
  decomposeNaturalLanguageIntent,
  initiateWebsiteCreation,
} from "../index.ts";

const TENANT_A = "tenant-sec-alpha";
const TENANT_B = "tenant-sec-bravo";
const FOUNDER_A = "user-founder-alpha";
const FOUNDER_B = "user-founder-bravo";

describe("MASTER SECURITY HARD TESTS (Section 17)", () => {
  // 1. Altered Action
  it("Negative Test 1: Altered action - Confirmation binding rejects tampered payload/action", () => {
    const confirmation = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_01",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main", commit: "abc123" },
    });

    // Attacker modifies action to destructive database write
    const tampered = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_01",
      actionName: "supabase.destructive_write",
      payload: { query: "DROP TABLE users;" },
    });

    assert.equal(tampered.valid, false);
    assert.equal(tampered.reason, "ACTION_MISMATCH");
  });

  // 2. Replayed Action
  it("Negative Test 2: Replayed action - Single-use token cannot be consumed twice", () => {
    const confirmation = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_02",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });

    // Legitimate first use
    const firstUse = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_02",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });
    assert.equal(firstUse.valid, true);

    // Replay attempt
    const replayAttempt = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_02",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });
    assert.equal(replayAttempt.valid, false);
    assert.equal(replayAttempt.reason, "ALREADY_USED");
  });

  // 3. Unauthorized Action / Escalation
  it("Negative Test 3: Unauthorized action - Agent cannot execute tools exceeding held permissions", () => {
    assert.throws(
      () => {
        createAutonomousAgent({
          name: "Privilege Escalation Rogue Agent",
          description: "Attempts destructive operations without permissions",
          objective: "Data export",
          tenantId: TENANT_A,
          ownerId: FOUNDER_A,
          creatorHeldTools: ["check_growth_status"], // Only holds read status
          tools: ["supabase.destructive_write", "vercel.deploy_promote"], // Demands high-consequence tools
        });
      },
      (err: Error) => {
        assert.ok(err.message.includes("SECURITY_PERMISSION_DENIED"));
        return true;
      }
    );
  });

  // 4. Wrong Tenant / Cross-Tenant Attachment Isolation
  it("Negative Test 4: Cross-tenant isolation - Tenant B cannot access Tenant A attachments", () => {
    const attachmentA = createNormalizedAttachment({
      messageId: "msg_secret_a",
      channel: "whatsapp",
      mimeType: "application/pdf",
      filename: "executive_q3_financials.pdf",
      buffer: Buffer.from("CONFIDENTIAL_REVENUE_DATA"),
      tenantId: TENANT_A,
      senderId: FOUNDER_A,
    });

    assert.throws(
      () => {
        ensureTenantAttachmentAccess(attachmentA, TENANT_B);
      },
      (err: Error) => {
        assert.ok(err.message.includes("SECURITY_CROSS_TENANT_VIOLATION"));
        return true;
      }
    );
  });

  // 5. Expired Action
  it("Negative Test 5: Expired action - Outdated confirmation codes are strictly rejected", () => {
    const confirmation = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_05",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
      ttlSeconds: -1, // Expired immediately
    });

    const result = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_05",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });

    assert.equal(result.valid, false);
    assert.equal(result.reason, "TOKEN_EXPIRED");
  });

  // 6. Invalid MIME Type
  it("Negative Test 6: Invalid MIME format rejected during attachment normalization", () => {
    assert.throws(
      () => {
        createNormalizedAttachment({
          messageId: "msg_bad_mime",
          channel: "whatsapp",
          mimeType: "application/x-msdownload", // Executable file
          filename: "malicious.exe",
          buffer: Buffer.from("MZ_EXECUTABLE_PAYLOAD"),
          tenantId: TENANT_A,
          senderId: FOUNDER_A,
        });
      },
      (err: Error) => {
        assert.ok(err.message.includes("Unsupported MIME type"));
        return true;
      }
    );

    const check = validateAttachment("application/x-msdownload", 1024);
    assert.equal(check.valid, false);
    assert.ok(check.error?.includes("Unsupported MIME type"));
  });

  // 7. Invalid Webhook HMAC Signature
  it("Negative Test 7: HMAC verification rejects invalid, altered, or forged webhook signatures", () => {
    process.env.STRATXCEL_AGENT_CHANNEL_SECRET = "test_secret_for_hard_tests";
    const body = JSON.stringify({ message: "hello" });
    const now = Math.floor(Date.now() / 1000).toString();

    // Bad signature
    const badSigResult = verifyAgentChannelRequest({
      timestampHeader: now,
      nonceHeader: "nonce_12345",
      signatureHeader: "bad_signature_test_abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      rawBody: body,
    });
    assert.equal(badSigResult.ok, false);
    assert.equal(badSigResult.reason, "bad_signature");

    // Missing headers
    const missingResult = verifyAgentChannelRequest({
      timestampHeader: null,
      nonceHeader: null,
      signatureHeader: null,
      rawBody: body,
    });
    assert.equal(missingResult.ok, false);
    assert.equal(missingResult.reason, "missing_headers");

    // Stale timestamp (1 hour ago)
    const staleResult = verifyAgentChannelRequest({
      timestampHeader: (Number(now) - 3600).toString(),
      nonceHeader: "nonce_stale",
      signatureHeader: "irrelevant_sig",
      rawBody: body,
    });
    assert.equal(staleResult.ok, false);
    assert.equal(staleResult.reason, "stale_timestamp");
  });

  // 8. Tool Outside Allowlist
  it("Negative Test 8: Agent execution enforces strict tool allowlist", () => {
    const agent = createAutonomousAgent({
      name: "Scoped Reader Agent",
      description: "Only reads stats",
      objective: "Read metrics",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      creatorHeldTools: ["check_growth_status"],
      tools: ["check_growth_status"],
    });

    assert.equal(agent.tools.length, 1);
    assert.equal(agent.tools.includes("aws.ec2_status" as never), false);
  });

  // 9. Zero Credential Leakage
  it("Negative Test 9: Zero secret or credential leakage in execution output", async () => {
    const res = await executeCoreMcpCapability("meta.debug_token", {}, {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.equal(res.secretLeakagePrevented, true);
    const serialized = JSON.stringify(res.output);
    assert.ok(!serialized.includes("EAAB"));
    assert.ok(!serialized.includes("APP_SECRET"));
    assert.ok(!serialized.includes("service_role"));
  });
});

describe("MASTER HARD TESTS & FAILURE RECOVERY (Section 20)", () => {
  // 1. Unconfirmed High-Consequence Operation Blocked
  it("Failure Hard Test 1: Unconfirmed high-consequence operations require Founder authorization", async () => {
    const res = await executeCoreMcpCapability("video.generate", { brief: "Promo video" }, {
      tenantId: TENANT_A,
      channel: "whatsapp",
      confirmedByFounder: false, // Not confirmed
    });

    assert.equal(res.status, "CONFIRMATION_REQUIRED");
    assert.ok(res.formattedMessage.includes("CONFIRMATION REQUIRED"));
  });

  // 2. Malformed Request Fallback
  it("Failure Hard Test 2: Malformed natural language query falls back gracefully to standard infrastructure overview", () => {
    const plan = decomposeNaturalLanguageIntent("??? %%% ^^^ random non-actionable input ???", {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.ok(plan);
    assert.equal(plan.inferredIntent, "General Infrastructure Health Overview");
    // Fallback tasks are ignored by the agent channel router in favor of runAgentTurn
    assert.equal(plan.tasks[0]?.capabilityKey, "vercel.production_health");
  });

  // 3. User Cancellation
  it("Failure Hard Test 3: Confirmation can be explicitly cancelled by user", () => {
    const confirmation = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_cancel",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });

    confirmation.cancelledAt = new Date().toISOString();

    const result = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_sec_a",
      tenantId: TENANT_A,
      missionId: "mission_sec_cancel",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });

    assert.equal(result.valid, false);
    assert.equal(result.reason, "CANCELLED");
  });

  // 4. Worker Self-Healing & Retry Ceilings
  it("Failure Hard Test 4: Worker self-healing recovers from crash and halts infinite retry loop", () => {
    const agent = createAutonomousAgent({
      name: "Hardy Worker",
      description: "Self-healing test worker",
      objective: "Queue monitor",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["check_growth_status"],
      budgetPolicy: { maxRetryCount: 2 },
    });

    deployAgent(agent.agentId);

    // Fail 1: Restarts
    evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(agent.status, "RUNNING");

    // Fail 2: Restarts
    evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(agent.status, "RUNNING");

    // Fail 3: Exceeds maxRetryCount (2) -> Stops in FAILED state
    const finalHeal = evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(agent.status, "FAILED");
    assert.equal(finalHeal.status, "UNHEALTHY");
  });

  // 5. Daily Spend and Run Quota Caps
  it("Failure Hard Test 5: Agent execution strictly halted when daily budget or run ceiling is hit", () => {
    const agent = createAutonomousAgent({
      name: "Spend Capped Agent",
      description: "Limits daily spend",
      objective: "API sync",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["check_growth_status"],
      budgetPolicy: { maxDailyCostUsd: 5.0, dailyExecutionQuotaRuns: 10 },
    });

    deployAgent(agent.agentId);

    // Hit cost cap
    agent.budgetPolicy.currentDaySpendUsd = 5.01;
    const check1 = checkAgentExecutionQuota(agent.agentId);
    assert.equal(check1.allowed, false);

    // Reset cost, hit run cap
    agent.budgetPolicy.currentDaySpendUsd = 0;
    agent.budgetPolicy.currentDayExecutionCount = 10;
    const check2 = checkAgentExecutionQuota(agent.agentId);
    assert.equal(check2.allowed, false);
  });

  // 6. Durable Mission Survives Re-invocation
  it("Failure Hard Test 6: Website creation pipeline handles re-invocation cleanly", async () => {
    const res1 = await initiateWebsiteCreation(null, {
      tenantId: TENANT_A,
      goalText: "Create a dental clinic website",
      businessName: "Smile Dental",
    });

    assert.ok(res1.missionId);
    assert.ok(res1.siteProjectId);
    assert.equal(res1.lifecycleStage, "PREVIEW");

    // Re-invocation with same business parameters
    const res2 = await initiateWebsiteCreation(null, {
      tenantId: TENANT_A,
      goalText: "Create a dental clinic website",
      businessName: "Smile Dental",
    });

    assert.ok(res2.missionId);
    assert.ok(res2.siteProjectId);
    assert.notEqual(res1.missionId, res2.missionId, "Creates distinct durable mission IDs");
  });
});
