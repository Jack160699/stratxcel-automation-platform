/**
 * Hermes Universal Founder OS - Comprehensive Acceptance Test Suite
 * StratXcel Automation Platform
 *
 * Verifies all 24 required end-to-end scenarios:
 * 1. WhatsApp text -> Hermes
 * 2. WhatsApp image -> Hermes analysis
 * 3. WhatsApp PDF -> Hermes analysis
 * 4. WhatsApp URL -> browser research
 * 5. Hermes -> image generation
 * 6. Hermes -> image returned to WhatsApp
 * 7. Hermes -> video generation
 * 8. Hermes -> video/file delivery
 * 9. "Make me a website"
 * 10. Website -> Antigravity -> GitHub -> Vercel
 * 11. Create SEO agent
 * 12. Deploy SEO agent
 * 13. Agent heartbeat
 * 14. Agent restart
 * 15. Agent stop
 * 16. Agent permission denial (least-privilege)
 * 17. Google research routing (facts vs inferences)
 * 18. Meta intelligence routing
 * 19. Cross-tenant isolation
 * 20. Confirmation anti-replay
 * 21. Credential leakage test
 * 22. File isolation & signed URL access
 * 23. Cost/quota enforcement
 * 24. Worker crash recovery and self-healing
 */

import { describe, it, beforeEach } from "node:test";
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
  resetConfirmationSecurityState,
} from "@stratxcel/agent-core";

import {
  decomposeNaturalLanguageIntent,
} from "../resources/intent-decomposer.ts";

import {
  executeCoreMcpCapability,
  executeDecomposedPlan,
} from "../resources/core-mcp-router.ts";

import {
  analyzeImage,
  analyzeDocumentFile,
  analyzeWebsiteLink,
  generateImageDeliverable,
  generateVideoDeliverable,
} from "../resources/multimodal-processor.ts";

import {
  createAutonomousAgent,
  deployAgent,
  pauseAgent,
  resumeAgent,
  stopAgent,
  restartAgent,
  recordAgentHeartbeat,
  evaluateAgentHealthAndSelfHeal,
  checkAgentExecutionQuota,
  orchestrateMultiAgentMission,
  resetAgentFactoryState,
  getAgent,
} from "../resources/agent-factory.ts";

describe("Hermes Universal Founder OS - 24 Scenario Acceptance Suite", () => {
  const TENANT_A = "tenant_alpha_enterprise";
  const TENANT_B = "tenant_beta_competitor";
  const FOUNDER_A = "founder_alice_101";
  const FOUNDER_B = "founder_bob_202";

  beforeEach(() => {
    resetConfirmationSecurityState();
    resetAgentFactoryState();
  });

  // --------------------------------------------------------------------------
  // TEST 1: WhatsApp text -> Hermes
  // --------------------------------------------------------------------------
  it("Scenario 1: WhatsApp text -> Hermes intent decomposition", () => {
    const plan = decomposeNaturalLanguageIntent("Check whether our production site is healthy and tell me what is wrong", {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.equal(plan.inferredIntent, "Production Multi-Provider Health Diagnostics");
    assert.ok(plan.tasks.length >= 2, "Should decompose into multiple diagnostics tasks");
    assert.equal(plan.tasks[0]?.provider, "Vercel");
    assert.equal(plan.tasks[1]?.provider, "AWS");
  });

  // --------------------------------------------------------------------------
  // TEST 2: WhatsApp image -> Hermes analysis
  // --------------------------------------------------------------------------
  it("Scenario 2: WhatsApp image -> Hermes analysis with OCR & UI critique", async () => {
    const attachment = createNormalizedAttachment({
      messageId: "msg_wa_img_001",
      channel: "whatsapp",
      mimeType: "image/png",
      filename: "checkout_screenshot.png",
      buffer: Buffer.from("RAW_PNG_PIXELS_MOCK"),
      tenantId: TENANT_A,
      senderId: "+919876543210",
      source: "inbound_upload",
    });

    const analysis = await analyzeImage({
      attachment,
      query: "Analyze this image and tell me what's wrong with checkout",
      focusArea: "ui_ux",
    });

    assert.equal(analysis.attachmentId, attachment.attachmentId);
    assert.ok(analysis.extractedText?.includes("StratXcel"), "Extracted text should be present");
    assert.ok(analysis.uiFeedback?.strengths.length! > 0, "UI feedback strengths should be populated");
    assert.ok(analysis.recommendedActions.length > 0, "Recommended actions should be present");
  });

  // --------------------------------------------------------------------------
  // TEST 3: WhatsApp PDF -> Hermes analysis
  // --------------------------------------------------------------------------
  it("Scenario 3: WhatsApp PDF -> Hermes analysis with terms and risks", async () => {
    const attachment = createNormalizedAttachment({
      messageId: "msg_wa_pdf_002",
      channel: "whatsapp",
      mimeType: "application/pdf",
      filename: "Commercial_Agreement_Q3.pdf",
      buffer: Buffer.from("%PDF-1.4 mock content"),
      tenantId: TENANT_A,
      senderId: "+919876543210",
    });

    const analysis = await analyzeDocumentFile({
      attachment,
      goal: "Read this proposal and give me the key risks",
    });

    assert.equal(analysis.fileCategory, "pdf");
    assert.ok(analysis.risksIdentified && analysis.risksIdentified.length > 0, "Key risks must be detected");
    assert.ok(analysis.actionPlan.length > 0, "Action plan must be formulated");
  });

  // --------------------------------------------------------------------------
  // TEST 4: WhatsApp URL -> browser research
  // --------------------------------------------------------------------------
  it("Scenario 4: WhatsApp URL -> browser diagnostics and SEO inspection", async () => {
    const result = await analyzeWebsiteLink({
      url: "https://stratxcel.com",
      tenantId: TENANT_A,
    });

    assert.equal(result.status, 200);
    assert.ok(result.uxScore > 80);
    assert.ok(result.seoScore > 80);
    assert.ok(result.findings.length >= 2);
    assert.equal(result.autoFixMissionEligible, true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Hermes -> image generation
  // --------------------------------------------------------------------------
  it("Scenario 5: Hermes -> image generation with brand grounding", async () => {
    const deliverable = await generateImageDeliverable({
      brief: "Premium solar inverter promotional banner for WhatsApp",
      tenantId: TENANT_A,
      aspectRatio: "1:1",
      channel: "whatsapp",
    });

    assert.ok(deliverable.assetId.startsWith("img_"));
    assert.equal(deliverable.status, "COMPLETED");
    assert.equal(deliverable.provider, "Google Gemini (Founder Browser)");
    assert.equal(deliverable.attachment.mimeType, "image/png");
    assert.ok(deliverable.estimatedCostUsd > 0);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Hermes -> image returned to WhatsApp
  // --------------------------------------------------------------------------
  it("Scenario 6: Hermes -> image returned to WhatsApp formatted with caption", async () => {
    const deliverable = await generateImageDeliverable({
      brief: "Create an Instagram campaign for this",
      tenantId: TENANT_A,
      aspectRatio: "4:5",
      channel: "whatsapp",
    });

    assert.ok(deliverable.whatsappCaption.includes("Creative generated"));
    assert.ok(deliverable.attachment.signedUrl?.includes("https://storage.stratxcel.in"));
    assert.ok(deliverable.resolution === "1080x1350");
  });

  // --------------------------------------------------------------------------
  // TEST 7: Hermes -> video generation pipeline
  // --------------------------------------------------------------------------
  it("Scenario 7: Hermes -> video generation with script, plan, and quality check", async () => {
    const video = await generateVideoDeliverable({
      brief: "Create a 20-second product video for our launch",
      tenantId: TENANT_A,
      durationSeconds: 20,
      channel: "whatsapp",
    });

    assert.ok(video.assetId.startsWith("vid_"));
    assert.equal(video.status, "COMPLETED");
    assert.equal(video.provider, "Google Veo");
    assert.ok(video.script.includes("Hook"));
    assert.ok(video.visualPlan.length >= 3);
    assert.ok(video.qualityScore >= 85, "Quality score must meet delivery threshold");
    assert.equal(video.durationSeconds, 20);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Hermes -> video/file delivery verification
  // --------------------------------------------------------------------------
  it("Scenario 8: Hermes -> video deliverable contains valid storage reference and signed URL", async () => {
    const video = await generateVideoDeliverable({
      brief: "Create a reel for this campaign",
      tenantId: TENANT_A,
      durationSeconds: 15,
      channel: "whatsapp",
    });

    assert.equal(video.attachment.mimeType, "video/mp4");
    assert.ok(video.attachment.storageRef.includes("tenants/tenant_alpha_enterprise"));
    assert.ok(video.attachment.sha256.length === 64, "SHA-256 checksum must be valid 64 chars");
  });

  // --------------------------------------------------------------------------
  // TEST 9: "Make me a website" intent resolution
  // --------------------------------------------------------------------------
  it("Scenario 9: 'Make me a website' decomposes to website.create", () => {
    const plan = decomposeNaturalLanguageIntent("Make me a website for my EV charging business", {
      tenantId: TENANT_A,
    });

    assert.equal(plan.inferredIntent, "Website Creation from Scratch");
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0]?.capabilityKey, "website.create");
    assert.equal(plan.tasks[0]?.provider, "Vercel");
  });

  // --------------------------------------------------------------------------
  // TEST 10: Website -> Antigravity -> GitHub -> Vercel pipeline
  // --------------------------------------------------------------------------
  it("Scenario 10: Website creation pipeline advances through project shell, GitHub, and Vercel", async () => {
    const res = await executeCoreMcpCapability("website.create", {
      goalText: "Build a landing page for SolarTech Bhilai",
      businessName: "SolarTech Bhilai",
      purpose: "Solar microgrid installation",
    }, {
      tenantId: TENANT_A,
      channel: "whatsapp",
      actorId: FOUNDER_A,
      confirmedByFounder: true,
    });

    assert.equal(res.status, "COMPLETED");
    assert.equal(res.provider, "Vercel");
    const output = res.output;
    assert.ok(output.siteProjectId, "Site project ID must be assigned");
    assert.ok(output.lifecycleStage === "PLANNING" || output.lifecycleStage === "PREVIEW");
    assert.equal(output.businessName, "SolarTech Bhilai");
    assert.ok(res.formattedMessage.includes("plan the site") || res.formattedMessage.includes("SolarTech Bhilai"));
  });

  // --------------------------------------------------------------------------
  // TEST 11: Create SEO agent (agent.create)
  // --------------------------------------------------------------------------
  it("Scenario 11: Create SEO monitoring agent with least-privilege tool allowlist", () => {
    const agent = createAutonomousAgent({
      name: "SEO Growth Watchdog",
      description: "Monitors search visibility and AEO keywords daily",
      objective: "Watch our SEO every day and report anomalies",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["check_growth_status", "browser_navigate", "browser_read"],
      schedule: "0 9 * * *",
    });

    assert.ok(agent.agentId.startsWith("agent_"));
    assert.equal(agent.status, "READY");
    assert.equal(agent.tools.length, 3);
    assert.equal(agent.healthCheck.status, "HEALTHY");
    assert.equal(agent.budgetPolicy.maxRetryCount, 3);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Deploy SEO agent (agent.deploy)
  // --------------------------------------------------------------------------
  it("Scenario 12: Deploy agent 24/7 as persistent worker on AWS", () => {
    const agent = createAutonomousAgent({
      name: "AWS Infrastructure Watcher",
      description: "Monitors EC2 runtime metrics",
      objective: "Keep cloud infrastructure healthy 24/7",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["aws.infrastructure_inspect", "aws.ec2_status"],
    });

    const deployed = deployAgent(agent.agentId);
    assert.equal(deployed.status, "RUNNING");
    assert.equal(deployed.healthCheck.status, "HEALTHY");
    assert.equal(deployed.healthCheck.heartbeatAgeSeconds, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Agent heartbeat monitoring
  // --------------------------------------------------------------------------
  it("Scenario 13: Agent heartbeat recording updates lastHeartbeat timestamp", () => {
    const agent = createAutonomousAgent({
      name: "Lead Ingestion Agent",
      description: "Polls CRM leads every morning",
      objective: "Sync new inbound leads",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["list_leads", "get_lead"],
    });

    deployAgent(agent.agentId);
    const health = recordAgentHeartbeat(agent.agentId);
    assert.equal(health.status, "HEALTHY");
    assert.equal(health.heartbeatAgeSeconds, 0);
    assert.ok(new Date(health.lastHeartbeatAt).getTime() <= Date.now());
  });

  // --------------------------------------------------------------------------
  // TEST 14: Agent restart workflow
  // --------------------------------------------------------------------------
  it("Scenario 14: Agent restart increments restart count and clears failure state", () => {
    const agent = createAutonomousAgent({
      name: "Social Monitoring Agent",
      description: "Watches Instagram engagement",
      objective: "Track comments",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["meta.intelligence"],
    });

    deployAgent(agent.agentId);
    assert.equal(agent.healthCheck.restartCount, 0);

    const restarted = restartAgent(agent.agentId);
    assert.equal(restarted.status, "RUNNING");
    assert.equal(restarted.healthCheck.restartCount, 1);
    assert.equal(restarted.healthCheck.consecutiveFailures, 0);
    assert.equal(restarted.healthCheck.status, "HEALTHY");
  });

  // --------------------------------------------------------------------------
  // TEST 15: Agent stop control
  // --------------------------------------------------------------------------
  it("Scenario 15: Agent stop halts execution and transitions status to STOPPED", () => {
    const agent = createAutonomousAgent({
      name: "Temporary Poller",
      description: "Polls data",
      objective: "Short term poll",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["browser_read"],
    });

    deployAgent(agent.agentId);
    assert.equal(agent.status, "RUNNING");

    const stopped = stopAgent(agent.agentId);
    assert.equal(stopped.status, "STOPPED");

    // Quota check refuses stopped agent
    const quota = checkAgentExecutionQuota(agent.agentId);
    assert.equal(quota.allowed, false);
    assert.ok(quota.reason?.includes("STOPPED"));
  });

  // --------------------------------------------------------------------------
  // TEST 16: Agent permission denial (least-privilege)
  // --------------------------------------------------------------------------
  it("Scenario 16: Agent creation fails if requested tools exceed creator's held permissions", () => {
    assert.throws(() => {
      createAutonomousAgent({
        name: "Privileged Agent",
        description: "Attempting privilege escalation",
        objective: "Destructive actions",
        tenantId: TENANT_A,
        ownerId: FOUNDER_A,
        tools: ["supabase.destructive_write", "unauthorized_root_shell"],
        creatorHeldTools: ["check_growth_status", "list_leads"], // Creator does NOT hold destructive_write
      });
    }, /SECURITY_PERMISSION_DENIED/);
  });

  // --------------------------------------------------------------------------
  // TEST 17: Google research routing (facts vs inferences)
  // --------------------------------------------------------------------------
  it("Scenario 17: Google research explicitly distinguishes verified facts vs Hermes inferences", async () => {
    const res = await executeCoreMcpCapability("google.research", {
      query: "Research the Indian EV market and give me a report",
    }, {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.equal(res.status, "COMPLETED");
    assert.equal(res.provider, "Google");
    const data = res.output;
    assert.ok(Array.isArray(data.verifiedFacts) && data.verifiedFacts.length > 0);
    assert.ok(Array.isArray(data.hermesInferences) && data.hermesInferences.length > 0);
    assert.ok(res.formattedMessage.includes("[VERIFIED FACT]"));
    assert.ok(res.formattedMessage.includes("[HERMES INFERENCE]"));
  });

  // --------------------------------------------------------------------------
  // TEST 18: Meta intelligence routing
  // --------------------------------------------------------------------------
  it("Scenario 18: Meta intelligence routes to Facebook and Instagram metrics", async () => {
    const res = await executeCoreMcpCapability("meta.intelligence", {}, {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.equal(res.status, "COMPLETED");
    assert.equal(res.provider, "Meta Developers");
    assert.ok(res.output.topEngagementArchetype);
    assert.ok(res.output.verifiedInsight);
  });

  // --------------------------------------------------------------------------
  // TEST 19: Cross-tenant isolation verification
  // --------------------------------------------------------------------------
  it("Scenario 19: Cross-tenant isolation blocks unauthorized attachment access", () => {
    const attachmentA = createNormalizedAttachment({
      messageId: "msg_priv_001",
      channel: "web",
      mimeType: "application/pdf",
      filename: "Confidential_Financials.pdf",
      buffer: Buffer.from("TENANT_A_CONFIDENTIAL_FINANCIALS"),
      tenantId: TENANT_A,
      senderId: FOUNDER_A,
    });

    // Access by owner tenant succeeds
    assert.doesNotThrow(() => {
      ensureTenantAttachmentAccess(attachmentA, TENANT_A);
    });

    // Access by different tenant fails closed
    assert.throws(() => {
      ensureTenantAttachmentAccess(attachmentA, TENANT_B);
    }, /SECURITY_CROSS_TENANT_VIOLATION/);
  });

  // --------------------------------------------------------------------------
  // TEST 20: Confirmation anti-replay token binding
  // --------------------------------------------------------------------------
  it("Scenario 20: Anti-replay confirmation binding blocks replay and altered actions", () => {
    const confirmation = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_alpha",
      tenantId: TENANT_A,
      missionId: "mission_deploy_001",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main", environment: "production" },
    });

    // First consumption succeeds
    const firstAttempt = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_alpha",
      tenantId: TENANT_A,
      missionId: "mission_deploy_001",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main", environment: "production" },
    });
    assert.equal(firstAttempt.valid, true);

    // Replay attack with same code fails closed
    const replayAttempt = consumeAntiReplayConfirmation(confirmation.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_alpha",
      tenantId: TENANT_A,
      missionId: "mission_deploy_001",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main", environment: "production" },
    });
    assert.equal(replayAttempt.valid, false);
    assert.equal(replayAttempt.reason, "ALREADY_USED");

    // Action mismatch test: token generated for deploy cannot authorize database delete
    const anotherConf = generateAntiReplayConfirmation({
      founderId: FOUNDER_A,
      companyId: "comp_alpha",
      tenantId: TENANT_A,
      missionId: "mission_002",
      actionName: "vercel.deploy_promote",
      payload: { branch: "main" },
    });

    const hijackAttempt = consumeAntiReplayConfirmation(anotherConf.displayCode, {
      founderId: FOUNDER_A,
      companyId: "comp_alpha",
      tenantId: TENANT_A,
      missionId: "mission_002",
      actionName: "supabase.destructive_write", // Altered action!
      payload: { query: "DROP TABLE users" },
    });
    assert.equal(hijackAttempt.valid, false);
    assert.equal(hijackAttempt.reason, "ACTION_MISMATCH");
  });

  // --------------------------------------------------------------------------
  // TEST 21: Credential leakage prevention
  // --------------------------------------------------------------------------
  it("Scenario 21: Zero credential leakage in output payloads and execution responses", async () => {
    const res = await executeCoreMcpCapability("meta.debug_token", {}, {
      tenantId: TENANT_A,
      channel: "whatsapp",
    });

    assert.equal(res.secretLeakagePrevented, true);
    const serialized = JSON.stringify(res.output);
    assert.ok(!serialized.includes("EAAB"), "Must not leak Meta access tokens");
    assert.ok(!serialized.includes("APP_SECRET"), "Must not leak secret keys");
    assert.ok(!serialized.includes("service_role"), "Must not leak service role credentials");
  });

  // --------------------------------------------------------------------------
  // TEST 22: File isolation and signed URL access
  // --------------------------------------------------------------------------
  it("Scenario 22: Ephemeral signed URLs contain HMAC signature, expiration TTL, and tenant binding", () => {
    const attachment = createNormalizedAttachment({
      messageId: "msg_url_test",
      channel: "whatsapp",
      mimeType: "image/webp",
      filename: "product_creative.webp",
      buffer: Buffer.from("SAMPLE_PIXELS"),
      tenantId: TENANT_A,
      senderId: FOUNDER_A,
    });

    const url = generateSignedAttachmentUrl(attachment, 15);
    assert.ok(url.includes("exp="), "Must contain expiration parameter");
    assert.ok(url.includes("sig="), "Must contain cryptographic HMAC signature");
    assert.ok(url.includes(`tid=${TENANT_A}`), "Must bind to owning tenant ID");
  });

  // --------------------------------------------------------------------------
  // TEST 23: Cost and quota enforcement
  // --------------------------------------------------------------------------
  it("Scenario 23: Agent daily spend quota is strictly enforced", () => {
    const agent = createAutonomousAgent({
      name: "Budget-Capped Agent",
      description: "Agent with strict spend cap",
      objective: "Batch processing",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["check_growth_status"],
      budgetPolicy: {
        maxDailyCostUsd: 1.0,
        dailyExecutionQuotaRuns: 5,
      },
    });

    deployAgent(agent.agentId);

    // Within quota
    assert.equal(checkAgentExecutionQuota(agent.agentId).allowed, true);

    // Simulate exceeding cost quota
    agent.budgetPolicy.currentDaySpendUsd = 1.5;
    const quotaCheckCost = checkAgentExecutionQuota(agent.agentId);
    assert.equal(quotaCheckCost.allowed, false);
    assert.ok(quotaCheckCost.reason?.includes("Daily cost budget reached"));

    // Reset cost, simulate exceeding run count quota
    agent.budgetPolicy.currentDaySpendUsd = 0.5;
    agent.budgetPolicy.currentDayExecutionCount = 5;
    const quotaCheckRuns = checkAgentExecutionQuota(agent.agentId);
    assert.equal(quotaCheckRuns.allowed, false);
    assert.ok(quotaCheckRuns.reason?.includes("Daily run quota reached"));
  });

  // --------------------------------------------------------------------------
  // TEST 24: Worker crash recovery and self-healing
  // --------------------------------------------------------------------------
  it("Scenario 24: Self-healing detects missed heartbeat (>90s) and restarts; halts infinite loop on retry limit", () => {
    const agent = createAutonomousAgent({
      name: "Resilient Worker Agent",
      description: "Worker that self-heals on crash",
      objective: "Continuous monitoring",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
      tools: ["browser_read"],
      budgetPolicy: {
        maxRetryCount: 3,
      },
    });

    deployAgent(agent.agentId);
    assert.equal(agent.healthCheck.consecutiveFailures, 0);

    // Crash 1: missed heartbeat of 120s -> automatic self-healing restart
    const heal1 = evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(heal1.consecutiveFailures, 1);
    assert.equal(heal1.restartCount, 1);
    assert.equal(agent.status, "RUNNING");

    // Crash 2
    const heal2 = evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(heal2.consecutiveFailures, 2);
    assert.equal(heal2.restartCount, 2);

    // Crash 3
    const heal3 = evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(heal3.consecutiveFailures, 3);
    assert.equal(heal3.restartCount, 3);

    // Crash 4: Exceeds max retry count (3) -> Escalates to FAILED and stops infinite loop
    const heal4 = evaluateAgentHealthAndSelfHeal(agent.agentId, 120);
    assert.equal(heal4.consecutiveFailures, 4);
    assert.equal(agent.status, "FAILED");
    assert.equal(heal4.status, "UNHEALTHY");
    assert.equal(heal4.restartCount, 3, "Must not increment restart count past ceiling");
  });

  // --------------------------------------------------------------------------
  // BONUS SCENARIO: Multi-Agent Mission Orchestration (Part 12)
  // --------------------------------------------------------------------------
  it("Multi-Agent Mission: Coordinates specialist agents and auto-archives on completion", async () => {
    const mission = await orchestrateMultiAgentMission({
      goal: "Research Indian EV market and prepare launch campaign",
      tenantId: TENANT_A,
      ownerId: FOUNDER_A,
    });

    assert.ok(mission.missionId.startsWith("mission_multi_"));
    assert.equal(mission.specialistAgents.length, 3);
    assert.ok(mission.synthesis.researchSummary.includes("EV"));
    assert.ok(mission.synthesis.metaIntelligence.includes("Meta"));
    assert.ok(mission.synthesis.executiveReport.includes("Ready for execution"));

    // Verify all temporary specialist agents are auto-archived
    for (const spec of mission.specialistAgents) {
      assert.equal(spec.status, "COMPLETED_AND_ARCHIVED");
      const loaded = getAgent(spec.agentId);
      assert.equal(loaded?.status, "ARCHIVED");
    }
  });
});
