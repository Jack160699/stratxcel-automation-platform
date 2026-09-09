import fs from "node:fs";
import { createNormalizedAttachment, ensureTenantAttachmentAccess } from "../packages/hermes/src/attachments.ts";
import {
  analyzeImage,
  analyzeWebsiteLink,
  generateImageDeliverable,
} from "../packages/connectors/src/resources/multimodal-processor.ts";
import {
  generateAntiReplayConfirmation,
  consumeAntiReplayConfirmation,
} from "../packages/agent-core/src/confirmations/anti-replay.ts";
import {
  createAutonomousAgent,
  deployAgent,
  recordAgentHeartbeat,
  evaluateAgentHealthAndSelfHeal,
  stopAgent,
} from "../packages/connectors/src/resources/agent-factory.ts";

async function runLiveAcceptance() {
  console.log("=================================================================");
  console.log("   HERMES UNIVERSAL FOUNDER OS - LIVE REAL-WORLD ACCEPTANCE PASS");
  console.log("=================================================================\n");

  const results = {};

  // 1. LIVE WHATSAPP MEDIA & GEMINI VISION TEST
  console.log("--> [1/6] Live Image Multimodal Vision (Google Gemini 3.5)...");
  try {
    const sampleImgPath = "C:/Users/shriyansh chandrakar/.gemini/antigravity-ide/brain/084fe9fe-34cc-47a8-94bd-f5f965c413b4/login_page_1788877560458.png";
    const imgBuf = fs.readFileSync(sampleImgPath);
    const attachment = createNormalizedAttachment({
      messageId: "wa_msg_live_001",
      channel: "whatsapp",
      mimeType: "image/png",
      filename: "login_page.png",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      senderId: "919584735857",
      source: "inbound_upload",
      buffer: imgBuf,
    });

    const visionResult = await analyzeImage({
      attachment,
      query: "Review this login page for conversion friction",
      focusArea: "ui_ux",
    });

    const hasRealGemini = visionResult.summary.includes("Stratxcel") && visionResult.summary.length > 200;
    results.imageVision = {
      passed: hasRealGemini,
      status: hasRealGemini ? "LIVE_VERIFIED" : "FAILED",
      summaryLength: visionResult.summary.length,
      snippet: visionResult.summary.slice(0, 140) + "...",
    };
    console.log("  ✓ Live Vision:", results.imageVision.status);
  } catch (err) {
    results.imageVision = { passed: false, status: "FAILED", error: err.message };
    console.error("  ✗ Live Vision Failed:", err.message);
  }

  // 2. LIVE URL / WEBSITE INSPECTION TEST
  console.log("\n--> [2/6] Live Public URL Inspection (HTTP & DOM Parser)...");
  try {
    const urlResult = await analyzeWebsiteLink({
      url: "https://example.com",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
    });

    const passed = urlResult.status === 200 && urlResult.title === "Example Domain";
    results.urlAnalysis = {
      passed,
      status: passed ? "LIVE_VERIFIED" : "FAILED",
      title: urlResult.title,
      statusHttp: urlResult.status,
      seoScore: urlResult.seoScore,
      latencyFinding: urlResult.findings[0],
    };
    console.log("  ✓ Live URL Inspection:", results.urlAnalysis.status, `(Title: "${urlResult.title}")`);
  } catch (err) {
    results.urlAnalysis = { passed: false, status: "FAILED", error: err.message };
    console.error("  ✗ Live URL Inspection Failed:", err.message);
  }

  // 3. LIVE IMAGE GENERATION TEST (Cloudflare AI SDXL)
  console.log("\n--> [3/6] Live Creative Image Generation (Cloudflare AI SDXL)...");
  try {
    const genResult = await generateImageDeliverable({
      brief: "Modern cybernetic business growth dashboard in dark teal and amber tones",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      aspectRatio: "1:1",
    });

    const bufSize = genResult.attachment.buffer ? genResult.attachment.buffer.length : 0;
    const isRealBinary = bufSize > 20000;
    results.imageGeneration = {
      passed: isRealBinary,
      status: isRealBinary ? "LIVE_VERIFIED" : "FAILED",
      mimeType: genResult.attachment.mimeType,
      byteSize: bufSize,
      signedUrlPresent: Boolean(genResult.attachment.signedUrl),
    };
    console.log("  ✓ Live Image Generation:", results.imageGeneration.status, `(${Math.round(bufSize / 1024)} KB real binary)`);
  } catch (err) {
    results.imageGeneration = { passed: false, status: "FAILED", error: err.message };
    console.error("  ✗ Live Image Generation Failed:", err.message);
  }

  // 4. LIVE VIDEO GENERATION TEST (Google Veo)
  console.log("\n--> [4/6] Live Video Generation Provider Access Probe (Google Veo)...");
  try {
    const veoRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt: "cinematic product shot of coffee" }] }),
    });
    const veoJson = await veoRes.json();
    if (veoJson.error?.code === 429 || veoJson.error?.status === "RESOURCE_EXHAUSTED") {
      results.videoGeneration = {
        passed: false,
        status: "AUTH_REQUIRED",
        reason: "Google Veo quota allocation limit (RESOURCE_EXHAUSTED / 429)",
      };
      console.log("  ⚠ Live Video Generation:", results.videoGeneration.status, `(${results.videoGeneration.reason})`);
    } else if (veoRes.ok) {
      results.videoGeneration = { passed: true, status: "LIVE_VERIFIED" };
      console.log("  ✓ Live Video Generation: LIVE_VERIFIED");
    } else {
      results.videoGeneration = { passed: false, status: "PROVIDER_UNAVAILABLE", error: veoJson.error?.message };
      console.log("  ⚠ Live Video Generation: PROVIDER_UNAVAILABLE");
    }
  } catch (err) {
    results.videoGeneration = { passed: false, status: "PROVIDER_UNAVAILABLE", error: err.message };
  }

  // 5. LIVE SECURITY & ANTI-REPLAY CRYPTOGRAPHIC VERIFICATION
  console.log("\n--> [5/6] Real Security & Anti-Replay Cryptographic Boundaries...");
  try {
    // 5a. Confirmation generation & single-use consumption
    const token = generateAntiReplayConfirmation({
      founderId: "founder-shriyansh",
      companyId: "comp-stratxcel",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      missionId: "mission-live-sec-01",
      actionName: "agent.stop",
      payload: { agentId: "agent-live-sec", force: true },
      ttlSeconds: 600,
    });

    const firstConsume = consumeAntiReplayConfirmation(token.confirmationId, {
      founderId: "founder-shriyansh",
      companyId: "comp-stratxcel",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      missionId: "mission-live-sec-01",
      actionName: "agent.stop",
      payload: { agentId: "agent-live-sec", force: true },
    });

    // 5b. Replay attempt
    const replayAttempt = consumeAntiReplayConfirmation(token.confirmationId, {
      founderId: "founder-shriyansh",
      companyId: "comp-stratxcel",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      missionId: "mission-live-sec-01",
      actionName: "agent.stop",
      payload: { agentId: "agent-live-sec", force: true },
    });

    // 5c. Unauthorized tamper attempt
    const tokenTamper = generateAntiReplayConfirmation({
      founderId: "founder-shriyansh",
      companyId: "comp-stratxcel",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      missionId: "mission-live-sec-02",
      actionName: "agent.stop",
      payload: { agentId: "agent-live-sec", force: false },
      ttlSeconds: 600,
    });

    const tamperedConsume = consumeAntiReplayConfirmation(tokenTamper.confirmationId, {
      founderId: "founder-shriyansh",
      companyId: "comp-stratxcel",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      missionId: "mission-live-sec-02",
      actionName: "agent.stop",
      payload: { agentId: "agent-live-sec", force: true }, // Altered payload!
    });

    // 5d. Cross-tenant isolation
    const sampleAtt = createNormalizedAttachment({
      messageId: "att_live_test",
      channel: "whatsapp",
      mimeType: "text/plain",
      filename: "secret.txt",
      tenantId: "tenant-owner",
      senderId: "founder-shriyansh",
      buffer: Buffer.from("confidential data"),
    });

    let tenantBlocked = false;
    try {
      ensureTenantAttachmentAccess(sampleAtt, "tenant-attacker");
    } catch (e) {
      tenantBlocked = e.message.includes("SECURITY_CROSS_TENANT_VIOLATION");
    }

    const secPass = firstConsume.valid && !replayAttempt.valid && !tamperedConsume.valid && tenantBlocked;
    results.security = {
      passed: secPass,
      status: secPass ? "LIVE_VERIFIED" : "FAILED",
      firstUsePassed: firstConsume.valid,
      replayBlocked: replayAttempt.reason === "ALREADY_USED",
      tamperBlocked: tamperedConsume.reason === "ACTION_MISMATCH",
      tenantIsolationEnforced: tenantBlocked,
    };
    console.log("  ✓ Security & Anti-Replay:", results.security.status);
  } catch (err) {
    results.security = { passed: false, status: "FAILED", error: err.message };
    console.error("  ✗ Security Failed:", err.message);
  }

  // 6. REAL AGENT FACTORY CREATION & LIFECYCLE
  console.log("\n--> [6/6] Real Agent Factory Creation & Health Lifecycle...");
  try {
    const agent = createAutonomousAgent({
      name: "Live Website SEO & Health Auditor",
      description: "Monitors homepage response, SSL validity, and title tag daily at 09:00",
      objective: "Daily SEO and uptime inspection",
      tenantId: "872723d5-0c21-4638-8921-99213c4ed63a",
      companyId: "comp-stratxcel",
      ownerId: "founder-shriyansh",
      skills: ["seo_auditing", "uptime_monitoring"],
      tools: ["link.analyze", "google.research"],
      schedule: "0 9 * * *",
      triggerPolicy: "cron",
      creatorHeldTools: ["link.analyze", "google.research"],
      budgetPolicy: { maxDailyCostUsd: 1.0, dailyExecutionQuotaRuns: 10 },
    });

    const deployed = deployAgent(agent.agentId, "C_AWS_LINUX");
    const deployedStatus = deployed.status;
    const heartbeat = recordAgentHeartbeat(agent.agentId, { activeTasks: 0 });
    const health = evaluateAgentHealthAndSelfHeal(agent.agentId);
    const stopped = stopAgent(agent.agentId);

    const agentPass = deployedStatus === "RUNNING" && heartbeat.status === "HEALTHY" && stopped.status === "STOPPED";
    results.agentFactory = {
      passed: agentPass,
      status: agentPass ? "LIVE_VERIFIED" : "FAILED",
      agentId: agent.agentId,
      toolAllowlist: agent.tools,
      runtimeStatus: deployed.status,
      stoppedStatus: stopped.status,
    };
    console.log("  ✓ Agent Factory Lifecycle:", results.agentFactory.status, `(ID: ${agent.agentId})`);
  } catch (err) {
    results.agentFactory = { passed: false, status: "FAILED", error: err.message };
    console.error("  ✗ Agent Factory Failed:", err.message);
  }

  console.log("\n=================================================================");
  console.log("   LIVE REAL-WORLD ACCEPTANCE PASS COMPLETED");
  console.log("=================================================================");
  return results;
}

runLiveAcceptance().catch(console.error);
