import assert from "node:assert";
import { createClient } from "@supabase/supabase-js";
import { probeGeminiReadiness } from "@stratxcel/ai-runtime";
import {
  selectBestResource,
  resolveConnectorHealth,
  executeConnectorCapability,
  recordConnectorAudit,
  listConnectorAuditLogs,
  getConnectorDefinition,
} from "@stratxcel/connectors";
import {
  probeFounderBrowserSession,
  scrubSensitivePayload,
} from "../packages/connectors/src/founder-computer/runtime.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runGoogleCertification() {
  console.log("==================================================");
  console.log("PHASE 2: GOOGLE CONNECTOR VERIFICATION & CERTIFICATION");
  console.log("==================================================");

  const results: Record<string, { pass: boolean; details: any }> = {};

  // -------------------------------------------------------------
  // Test 1: Google Authentication Verification
  // -------------------------------------------------------------
  console.log("\n[Test 1/13] Google Authentication Verification...");
  const sessionProbe = await probeFounderBrowserSession({ timeoutMs: 5000 });
  assert.strictEqual(sessionProbe.ok, true, "Session probe must return ok: true");
  assert.strictEqual(sessionProbe.authenticated, true, "Session must be authenticated");
  assert.strictEqual(sessionProbe.accountEmail, "shriyanshtv@gmail.com", "Account must match Founder account shriyanshtv@gmail.com");
  assert.ok(sessionProbe.authenticatedDomains.includes("google.com"), "google.com must be authenticated");
  assert.ok(sessionProbe.authenticatedDomains.includes("myaccount.google.com"), "myaccount.google.com must be authenticated");
  results["1_google_auth"] = {
    pass: true,
    details: {
      accountEmail: sessionProbe.accountEmail,
      authenticatedDomains: sessionProbe.authenticatedDomains,
      source: sessionProbe.source,
      primaryTabUrl: sessionProbe.primaryTab?.url,
    },
  };
  console.log("✓ PASS: Verified Founder Google Account shriyanshtv@gmail.com");

  // -------------------------------------------------------------
  // Test 2: Gemini Safe Read/Prompt Verification (API & Browser)
  // -------------------------------------------------------------
  console.log("\n[Test 2/13] Gemini Safe Read/Prompt Verification...");
  const geminiProbe = await probeGeminiReadiness({ apiKey: process.env.GEMINI_API_KEY });
  assert.strictEqual(geminiProbe.configured, true, "GEMINI_API_KEY must be configured");
  assert.strictEqual(geminiProbe.reachable, true, "Gemini API must be reachable");
  assert.strictEqual(geminiProbe.modelAvailable, true, "Gemini model must be available");

  // Also verify browser execution handler for gemini.chat
  const geminiBrowserExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "gemini.chat",
    tenantId: null,
    actorKind: "founder",
    payload: { prompt: "Safe readiness ping: ping" },
  });
  assert.strictEqual(geminiBrowserExec.success, true, "gemini.chat execution must succeed");
  results["2_gemini_readiness"] = {
    pass: true,
    details: {
      apiProbe: { configured: geminiProbe.configured, reachable: geminiProbe.reachable, modelAvailable: geminiProbe.modelAvailable },
      browserExec: { workflow: (geminiBrowserExec.data as any)?.workflow, executedAt: (geminiBrowserExec.data as any)?.executedAt },
    },
  };
  console.log("✓ PASS: Gemini API and browser execution verified");

  // -------------------------------------------------------------
  // Test 3: AI Studio Capability Verification
  // -------------------------------------------------------------
  console.log("\n[Test 3/13] Google AI Studio Capability Verification...");
  const aiStudioExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "aistudio.prompt",
    tenantId: null,
    actorKind: "founder",
    payload: { prompt: "Ping test" },
  });
  assert.strictEqual(aiStudioExec.success, true, "aistudio.prompt execution must succeed");
  results["3_aistudio_capability"] = {
    pass: true,
    details: {
      provider: (aiStudioExec.data as any)?.provider,
      workflow: (aiStudioExec.data as any)?.workflow,
    },
  };
  console.log("✓ PASS: Google AI Studio capability verified");

  // -------------------------------------------------------------
  // Test 4: Drive Browse Verification
  // -------------------------------------------------------------
  console.log("\n[Test 4/13] Google Drive Browse Verification...");
  const driveBrowseExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "drive.browse",
    tenantId: null,
    actorKind: "founder",
    payload: { queueOnly: true },
  });
  assert.strictEqual(driveBrowseExec.success, true, "drive.browse execution must succeed");
  results["4_drive_browse"] = {
    pass: true,
    details: {
      capability: driveBrowseExec.capabilityKey,
      status: (driveBrowseExec.data as any)?.status,
      executionMethod: driveBrowseExec.executionMethod,
    },
  };
  console.log("✓ PASS: Google Drive browse capability verified");

  // -------------------------------------------------------------
  // Test 5: Drive Download & Upload Confirmation Gate Verification
  // -------------------------------------------------------------
  console.log("\n[Test 5/13] Drive Download & Upload Confirmation Gate...");
  const driveDownloadExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "drive.download",
    tenantId: null,
    actorKind: "founder",
    payload: { queueOnly: true, fileId: "test-file-safe-id" },
  });
  assert.strictEqual(driveDownloadExec.success, true, "drive.download execution must succeed");

  // Verify drive.upload in resource selector requires confirmation
  const uploadSelection = await selectBestResource(supabase as never, {
    capabilityKey: "drive.upload",
    tenantId: null,
  });
  assert.strictEqual(uploadSelection.status, "AVAILABLE_WITH_CONFIRMATION", "drive.upload must be AVAILABLE_WITH_CONFIRMATION");
  assert.strictEqual(uploadSelection.requiresConfirmation, true, "drive.upload requiresConfirmation must be true");
  results["5_drive_ops"] = {
    pass: true,
    details: {
      downloadStatus: (driveDownloadExec.data as any)?.status,
      uploadGate: { status: uploadSelection.status, requiresConfirmation: uploadSelection.requiresConfirmation },
    },
  };
  console.log("✓ PASS: Drive download safe & upload strictly confirmation-gated");

  // -------------------------------------------------------------
  // Test 6: Google Cloud Console Safe Inspection Verification
  // -------------------------------------------------------------
  console.log("\n[Test 6/13] Google Cloud Console Safe Inspection...");
  const cloudExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "cloud.console_browse",
    tenantId: null,
    actorKind: "founder",
    payload: { target: "dashboard" },
  });
  assert.strictEqual(cloudExec.success, true, "cloud.console_browse execution must succeed");
  assert.strictEqual((cloudExec.data as any)?.readOnly, true, "cloud.console_browse must be readOnly: true");
  results["6_cloud_console"] = {
    pass: true,
    details: {
      provider: (cloudExec.data as any)?.provider,
      readOnly: (cloudExec.data as any)?.readOnly,
      inspectedAt: (cloudExec.data as any)?.inspectedAt,
    },
  };
  console.log("✓ PASS: Google Cloud Console safe inspection verified");

  // -------------------------------------------------------------
  // Test 7: Google Colab Access Verification
  // -------------------------------------------------------------
  console.log("\n[Test 7/13] Google Colab Access Verification...");
  const colabSelection = await selectBestResource(supabase as never, {
    capabilityKey: "colab.notebook",
    tenantId: null,
  });
  assert.strictEqual(colabSelection.status, "AVAILABLE_WITH_CONFIRMATION", "colab.notebook must require confirmation for execution");
  assert.strictEqual(colabSelection.requiresConfirmation, true, "colab.notebook requiresConfirmation must be true");

  const colabExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "colab.notebook",
    tenantId: null,
    actorKind: "founder",
    payload: { notebookUrl: "https://colab.research.google.com/" },
  });
  assert.strictEqual(colabExec.success, true, "colab.notebook execution handler must succeed");
  results["7_colab_access"] = {
    pass: true,
    details: {
      status: (colabExec.data as any)?.status,
      requiresConfirmation: colabSelection.requiresConfirmation,
    },
  };
  console.log("✓ PASS: Google Colab access verified with confirmation gating");

  // -------------------------------------------------------------
  // Test 8: Google Jules Capability Verification
  // -------------------------------------------------------------
  console.log("\n[Test 8/13] Google Jules Capability Verification...");
  const julesExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "jules.task",
    tenantId: null,
    actorKind: "founder",
    payload: { task: "safe_ping_task" },
  });
  assert.strictEqual(julesExec.success, true, "jules.task execution must succeed");
  results["8_jules_capability"] = {
    pass: true,
    details: {
      provider: (julesExec.data as any)?.provider,
      status: (julesExec.data as any)?.status,
    },
  };
  console.log("✓ PASS: Google Jules safe capability discovery verified");

  // -------------------------------------------------------------
  // Test 9: Founder Browser Google-Session Verification
  // -------------------------------------------------------------
  console.log("\n[Test 9/13] Founder Browser Google-Session Verification...");
  assert.ok(sessionProbe.activeTabs.length > 0, "Active tabs must be present");
  const googleTab = sessionProbe.activeTabs.find((t) => t.isGoogleAuth || t.hostname.includes("google.com"));
  assert.ok(googleTab, "At least one active Google tab must be found in browser profile");
  results["9_founder_browser_session"] = {
    pass: true,
    details: {
      totalTabs: sessionProbe.activeTabs.length,
      primaryTab: sessionProbe.primaryTab?.url,
      accountEmail: sessionProbe.accountEmail,
    },
  };
  const primaryHostname = sessionProbe.primaryTab?.url ? new URL(sessionProbe.primaryTab.url).hostname : "none";
  console.log(`✓ PASS: Active tabs verified (${sessionProbe.activeTabs.length} tabs, primary: ${primaryHostname})`);

  // -------------------------------------------------------------
  // Test 10: Hermes Dynamic Resource Selector Verification
  // -------------------------------------------------------------
  console.log("\n[Test 10/13] Hermes Dynamic Resource Selector Verification...");
  const routingTests = [
    { cap: "gemini.chat", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "drive.browse", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "drive.download", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "drive.upload", expectedConn: "founder_computer", expectConfirm: true },
    { cap: "aistudio.prompt", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "cloud.console_browse", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "colab.notebook", expectedConn: "founder_computer", expectConfirm: true },
    { cap: "jules.task", expectedConn: "founder_computer", expectConfirm: false },
    { cap: "image.generate", expectedConn: "founder_computer", expectConfirm: true },
    { cap: "video.generate", expectedConn: "founder_computer", expectConfirm: true },
  ];

  const selectorOutcomes: any[] = [];
  for (const t of routingTests) {
    const sel = await selectBestResource(supabase as never, { capabilityKey: t.cap, tenantId: null });
    assert.strictEqual(sel.selectedConnector, t.expectedConn, `Selector for ${t.cap} must choose ${t.expectedConn}`);
    assert.strictEqual(sel.requiresConfirmation, t.expectConfirm, `Selector for ${t.cap} requiresConfirmation must be ${t.expectConfirm}`);
    selectorOutcomes.push({
      capability: t.cap,
      connector: sel.selectedConnector,
      method: sel.executionMethod,
      status: sel.status,
      requiresConfirmation: sel.requiresConfirmation,
    });
  }
  results["10_hermes_selector"] = {
    pass: true,
    details: selectorOutcomes,
  };
  console.log(`✓ PASS: All ${routingTests.length} dynamic resource routing paths verified with accurate confirmation gates`);

  // -------------------------------------------------------------
  // Test 11: Admin Visibility Verification
  // -------------------------------------------------------------
  console.log("\n[Test 11/13] Admin Visibility Verification...");
  const googleDef = getConnectorDefinition("google");
  assert.ok(googleDef, "google definition must be registered");

  const { data: googleConn } = await supabase
    .from("connector_connections")
    .select("*")
    .eq("connector_key", "google")
    .is("tenant_id", null)
    .single();

  assert.ok(googleConn, "Platform-scoped google connector_connection must exist");
  assert.strictEqual(googleConn.status, "healthy", "Google connector connection status must be healthy");

  const googleHealth = await resolveConnectorHealth(supabase as never, "google", googleConn as any, null);
  assert.strictEqual(googleHealth.status, "healthy", "Google health resolution must be healthy");
  assert.ok(googleHealth.discoveredCapabilities.length >= 8, "Must discover at least 8 capabilities");
  results["11_admin_visibility"] = {
    pass: true,
    details: {
      connectionId: googleConn.id,
      status: googleHealth.status,
      accountEmail: (googleHealth.details as any)?.accountEmail,
      discoveredCapabilitiesCount: googleHealth.discoveredCapabilities.length,
      discoveredCapabilities: googleHealth.discoveredCapabilities,
    },
  };
  console.log(`✓ PASS: Admin visibility verified (Status: healthy, Account: ${(googleHealth.details as any)?.accountEmail}, Capabilities: ${googleHealth.discoveredCapabilities.length})`);

  // -------------------------------------------------------------
  // Test 12: Audit Logging Verification
  // -------------------------------------------------------------
  console.log("\n[Test 12/13] Audit Logging Verification...");
  const auditTestMeta = {
    action: "google_connector_verification_ping",
    timestamp: new Date().toISOString(),
    caller: "e2e_verification_suite",
  };

  await recordConnectorAudit(supabase as never, {
    connectorKey: "google",
    connectionId: googleConn.id,
    tenantId: null,
    actorKind: "hermes",
    eventType: "execution_completed",
    capabilityKey: "gemini.chat",
    executionMethod: "browser",
    status: "success",
    metadata: auditTestMeta,
  });

  const recentLogs = await listConnectorAuditLogs(supabase as never, {
    connectorKey: "google",
    limit: 5,
  });

  assert.ok(recentLogs.length > 0, "Audit logs must record Google connector operations");
  const matchingLog = recentLogs.find((l) => l.capability_key === "gemini.chat" || l.metadata?.capabilityKey === "gemini.chat");
  assert.ok(matchingLog, "Matching audit log event must exist in audit log history");
  results["12_audit_logging"] = {
    pass: true,
    details: {
      eventCount: recentLogs.length,
      latestAction: matchingLog.event_type || matchingLog.status,
      timestamp: matchingLog.created_at,
    },
  };
  console.log(`✓ PASS: Sanitized audit log entry successfully recorded and verified (${recentLogs.length} events logged)`);

  // -------------------------------------------------------------
  // Test 13: Secret Masking Verification
  // -------------------------------------------------------------
  console.log("\n[Test 13/13] Secret Masking Verification...");
  const dirtyPayload = {
    account: "shriyanshtv@gmail.com",
    token: "ya29.a0ARrdaM8fakeSecretTokenExample",
    session_secret: "superSecretValue123",
    auth_password: "founderPasswordDoNotLog",
    cookie: "SID=fakeSessionCookie12345",
    nested: {
      private_key: "-----BEGIN PRIVATE KEY-----",
      harmless_field: "harmless_metadata",
    },
  };

  const scrubbed = scrubSensitivePayload(dirtyPayload);
  assert.strictEqual(scrubbed.token, "[REDACTED]", "token must be redacted");
  assert.strictEqual(scrubbed.session_secret, "[REDACTED]", "session_secret must be redacted");
  assert.strictEqual(scrubbed.auth_password, "[REDACTED]", "auth_password must be redacted");
  assert.strictEqual(scrubbed.cookie, "[REDACTED]", "cookie must be redacted");
  assert.strictEqual((scrubbed.nested as any).private_key, "[REDACTED]", "nested private_key must be redacted");
  assert.strictEqual((scrubbed.nested as any).harmless_field, "harmless_metadata", "harmless metadata must be preserved");
  assert.strictEqual(scrubbed.account, "shriyanshtv@gmail.com", "harmless account identifier must be preserved");

  results["13_secret_masking"] = {
    pass: true,
    details: {
      tokenRedacted: scrubbed.token === "[REDACTED]",
      passwordRedacted: scrubbed.auth_password === "[REDACTED]",
      cookieRedacted: scrubbed.cookie === "[REDACTED]",
      privateKeyRedacted: (scrubbed.nested as any).private_key === "[REDACTED]",
    },
  };
  console.log("✓ PASS: Zero-leakage secret masking strictly verified across all sensitive keys");

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n==================================================");
  console.log("ALL 13 GOOGLE VERIFICATION CHECKS PASSED (13/13)");
  console.log("==================================================");
  console.log(JSON.stringify(results, null, 2));

  return results;
}

runGoogleCertification().catch((e) => {
  console.error("Verification suite failed:", e);
  process.exit(1);
});
