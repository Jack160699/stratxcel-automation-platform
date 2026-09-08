// Run with: node --experimental-strip-types packages/connectors/src/__tests__/founder-computer.test.ts
//
// Founder Computer / Browser Resource Test Suite
// Verifies:
// 1. Connector registry entry has correct attributes (mcp_managed, platform scope, browser preference)
// 2. Health probe correctly resolves all states based on metadata
// 3. Capability discovery behaves honestly per authenticated domains
// 4. Session management correctly parses, formats, and tracks TTL
// 5. Capability execution handlers register and return valid queued job results
// 6. Security model: secrets are never accepted or stored, raw tokens never exposed

import assert from "node:assert/strict";
import {
  CONNECTOR_REGISTRY,
  getConnectorDefinition,
  resolveConnectorHealth,
  executeConnectorCapability,
  parseFounderComputerSession,
  deriveHealthStatusFromSession,
  deriveCapabilitiesFromSession,
  buildInitialSessionMetadata,
  buildSessionVerifiedMetadata,
  generateProfileId,
  discoverFounderComputerCapabilities,
  toDiscoveredCapabilityKeys,
  getPersistentProfileDir,
  scrubSensitivePayload,
  executeBrowserAction,
  executeComputerAction,
} from "../index.ts";
import type { ConnectorConnectionRow } from "../types.ts";

function createMockConnection(metadata: Record<string, unknown> | null, status = "connected"): ConnectorConnectionRow {
  return {
    id: "fc-conn-1",
    connector_key: "founder_computer",
    tenant_id: null,
    status: status as never,
    encrypted_secret_ref: null,
    discovered_capabilities: [],
    last_health_check_at: null,
    last_verified_at: (metadata?.lastVerifiedAt as string) ?? null,
    discovered_at: null,
    last_error: null,
    connected_by_user_id: "founder-user-1",
    connected_at: new Date().toISOString(),
    metadata: metadata ?? {},
    budget_limit_usd: null,
    current_usage_usd: 0,
    rate_limit_per_minute: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function testRegistryDefinition() {
  const def = getConnectorDefinition("founder_computer");
  assert.ok(def, "founder_computer must exist in CONNECTOR_REGISTRY");
  assert.equal(def.key, "founder_computer");
  assert.equal(def.label, "Founder Computer");
  assert.equal(def.category, "browser_computer");
  assert.equal(def.authMethod, "mcp_managed");
  assert.equal(def.scopeLevel, "platform");
  assert.equal(def.preferredAccessMethod, "browser");
  assert.ok(def.supportedAccessMethods.includes("browser"));

  const requiredBrowserCaps = [
    "browser.navigate", "browser.click", "browser.type", "browser.key", "browser.select",
    "browser.scroll", "browser.wait", "browser.screenshot", "browser.read",
    "browser.upload", "browser.download", "browser.tabs", "browser.close",
  ];
  for (const cap of requiredBrowserCaps) {
    assert.ok(def.declaredCapabilities.includes(cap), `Must include ${cap}`);
  }

  const requiredComputerCaps = [
    "computer.open_app", "computer.click", "computer.type",
    "computer.key", "computer.screenshot", "computer.wait",
  ];
  for (const cap of requiredComputerCaps) {
    assert.ok(def.declaredCapabilities.includes(cap), `Must include ${cap}`);
  }

  console.log("✓ founder_computer registry definition verified (all 19 browser and computer primitives)");
}

async function testHealthProbeStates() {
  const mockSupabase = {
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
    },
  };

  // 1. Not configured when no connection exists
  const healthNone = await resolveConnectorHealth(mockSupabase as never, "founder_computer", null, null);
  assert.equal(healthNone.status, "not_configured");

  // 2. Auth required when connection has no session profile
  const connAuthReq = createMockConnection({}, "auth_required");
  const healthAuthReq = await resolveConnectorHealth(mockSupabase as never, "founder_computer", connAuthReq, null);
  assert.equal(healthAuthReq.status, "auth_required");

  // 3. Healthy when verified recently
  const connHealthy = createMockConnection({
    profileId: "profile-test-1",
    sessionStatus: "ready",
    lastVerifiedAt: new Date().toISOString(),
    authenticatedDomains: ["google.com"],
  }, "connected");
  const healthHealthy = await resolveConnectorHealth(mockSupabase as never, "founder_computer", connHealthy, null);
  assert.equal(healthHealthy.status, "healthy");
  assert.ok(healthHealthy.discoveredCapabilities.includes("browser.navigate"));

  // 4. Degraded when last verified > 24 hours ago
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const connDegraded = createMockConnection({
    profileId: "profile-test-1",
    sessionStatus: "ready",
    lastVerifiedAt: twoDaysAgo,
    authenticatedDomains: ["google.com"],
  }, "connected");
  const healthDegraded = await resolveConnectorHealth(mockSupabase as never, "founder_computer", connDegraded, null);
  assert.equal(healthDegraded.status, "degraded");

  // 5. Expired / requires_reauth
  const connExpired = createMockConnection({
    profileId: "profile-test-1",
    sessionStatus: "expired",
    authenticatedDomains: ["google.com"],
  }, "auth_expired");
  const healthExpired = await resolveConnectorHealth(mockSupabase as never, "founder_computer", connExpired, null);
  assert.equal(healthExpired.status, "requires_reauth");

  console.log("✓ founder_computer health probe states verified (not_configured, auth_required, healthy, degraded, requires_reauth)");
}

async function testSessionParsingAndMetadataBuilders() {
  const profileId = generateProfileId();
  assert.ok(profileId.startsWith("fc-"));

  const initialMeta = buildInitialSessionMetadata({ profileId, runtimeHostRef: "ec2-test-host" });
  assert.equal(initialMeta.profileId, profileId);
  assert.equal(initialMeta.sessionStatus, "auth_required");
  assert.equal(initialMeta.runtimeHostRef, "ec2-test-host");

  const parsedInitial = parseFounderComputerSession(initialMeta);
  assert.ok(parsedInitial);
  assert.equal(parsedInitial.status, "auth_required");
  assert.equal(parsedInitial.isHealthy, false);

  const verifiedMeta = buildSessionVerifiedMetadata({
    existing: initialMeta,
    authenticatedDomains: ["google.com", "accounts.google.com"],
    browserVersion: "Chromium 120",
  });
  assert.equal(verifiedMeta.sessionStatus, "ready");
  assert.deepEqual(verifiedMeta.authenticatedDomains, ["google.com", "accounts.google.com"]);
  assert.equal(verifiedMeta.browserVersion, "Chromium 120");

  const parsedVerified = parseFounderComputerSession(verifiedMeta);
  assert.ok(parsedVerified);
  assert.equal(parsedVerified.status, "ready");
  assert.equal(parsedVerified.isHealthy, true);
  assert.equal(deriveHealthStatusFromSession(parsedVerified), "healthy");

  const derivedCaps = deriveCapabilitiesFromSession(parsedVerified);
  assert.ok(derivedCaps.includes("browser.navigate"));
  assert.ok(derivedCaps.includes("browser.screenshot"));
  assert.ok(derivedCaps.includes("computer.open_app")); // because google.com is authenticated

  console.log("✓ founder_computer session parsing and metadata builders verified");
}

async function testHonestCapabilityDiscovery() {
  // 1. When session is null, all capabilities are unavailable
  const nullCaps = discoverFounderComputerCapabilities(null);
  assert.ok(nullCaps.length > 0);
  assert.ok(nullCaps.every((c) => c.status === "unavailable"));

  // 2. When session is auth_required, all capabilities are requires_auth
  const sessionAuthReq = parseFounderComputerSession({
    profileId: "p1",
    sessionStatus: "auth_required",
  });
  const authReqCaps = discoverFounderComputerCapabilities(sessionAuthReq);
  assert.ok(authReqCaps.every((c) => c.status === "requires_auth"));

  // 3. When session is ready with google.com:
  // Base primitives: available
  // Google capabilities: available
  // Antigravity run_task / video: available_with_confirmation
  const sessionGoogle = parseFounderComputerSession({
    profileId: "p1",
    sessionStatus: "ready",
    lastVerifiedAt: new Date().toISOString(),
    authenticatedDomains: ["google.com", "accounts.google.com"],
  });
  const googleCaps = discoverFounderComputerCapabilities(sessionGoogle);

  const nav = googleCaps.find((c) => c.capability === "browser.navigate");
  assert.equal(nav?.status, "available");

  const geminiChat = googleCaps.find((c) => c.capability === "gemini.chat");
  assert.equal(geminiChat?.status, "available");

  const antiTask = googleCaps.find((c) => c.capability === "antigravity.run_task");
  assert.equal(antiTask?.status, "available_with_confirmation");

  const discoveredKeys = toDiscoveredCapabilityKeys(googleCaps);
  assert.ok(discoveredKeys.includes("browser.navigate"));
  assert.ok(discoveredKeys.includes("gemini.chat"));
  assert.ok(discoveredKeys.includes("antigravity.run_task"));

  console.log("✓ founder_computer honest capability discovery verified");
}

async function testExecutionHandlers() {
  const connectionData = createMockConnection({
    profileId: "fc-test",
    sessionStatus: "ready",
    lastVerifiedAt: new Date().toISOString(),
  }, "connected");

  const mockSupabase = {
    from(table: string) {
      if (table === "connector_connections") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          is() { return builder; },
          update() { return builder; },
          async maybeSingle() { return { data: connectionData, error: null }; },
          async single() { return { data: connectionData, error: null }; },
        };
        return builder;
      }
      if (table === "connector_capability_assignments") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          then(resolve: (v: { data: unknown; error: null }) => void) {
            resolve({
              data: [
                {
                  autonomy: "execute",
                  tenant_id: null,
                  budget_limit_usd: null,
                  current_usage_usd: 0,
                  allowed_methods: ["browser"],
                },
              ],
              error: null,
            });
          },
        };
        return builder;
      }
      if (table === "connector_audit_logs") {
        return {
          insert() { return Promise.resolve({ data: null, error: null }); },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    },
  };

  const navResult = await executeConnectorCapability(mockSupabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "browser.navigate",
    tenantId: null,
    payload: { url: "https://example.com", queueOnly: true },
  });

  assert.equal(navResult.success, true);
  const navData = navResult.data as { status: string; jobId: string; payload: { url: string } };
  assert.equal(navData.status, "queued");
  assert.ok(navData.jobId.startsWith("fc-job-"));
  assert.equal(navData.payload.url, "https://example.com");

  const shotResult = await executeConnectorCapability(mockSupabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "browser.screenshot",
    tenantId: null,
    payload: { queueOnly: true },
  });
  assert.equal(shotResult.success, true);
  const shotData = shotResult.data as { status: string; jobId: string };
  assert.equal(shotData.status, "queued");
  assert.ok(shotData.jobId.startsWith("fc-job-"));

  const readResult = await executeConnectorCapability(mockSupabase as never, {
    connectorKey: "founder_computer",
    capabilityKey: "browser.read",
    tenantId: null,
    payload: { selector: "body", queueOnly: true },
  });
  assert.equal(readResult.success, true);
  const readData = readResult.data as { status: string; jobId: string; payload: { selector: string } };
  assert.equal(readData.status, "queued");
  assert.ok(readData.jobId.startsWith("fc-job-"));
  assert.equal(readData.payload.selector, "body");

  console.log("✓ founder_computer execution handlers verified (queued execution, non-blocking)");
}

async function testRuntimePersistenceAndScrubbing() {
  const profileDir = getPersistentProfileDir();
  assert.ok(profileDir, "Profile directory must not be empty");
  assert.ok(profileDir.includes(".stratxcel-founder-computer-profile"), "Profile must point to dedicated profile folder");

  const sensitive = {
    url: "https://example.com",
    password: "secret_password_123",
    cookie: "session_cookie_abc",
    token: "bearer_token_xyz",
    safeData: "user query text",
  };
  const scrubbed = scrubSensitivePayload(sensitive);
  assert.equal(scrubbed.password, "[REDACTED]", "password must be redacted");
  assert.equal(scrubbed.cookie, "[REDACTED]", "cookie must be redacted");
  assert.equal(scrubbed.token, "[REDACTED]", "token must be redacted");
  assert.equal(scrubbed.safeData, "user query text", "safeData must be preserved");

  console.log("✓ persistent profile directory & token scrubbing verified");
}

async function testAllBrowserAndComputerActions() {
  const connectionData = createMockConnection({
    profileId: "fc-test-full",
    sessionStatus: "ready",
    lastVerifiedAt: new Date().toISOString(),
  }, "connected");

  const mockSupabase = {
    from(table: string) {
      if (table === "connector_connections") {
        const b: any = {
          select() { return b; }, eq() { return b; }, is() { return b; }, update() { return b; },
          async maybeSingle() { return { data: connectionData, error: null }; },
          async single() { return { data: connectionData, error: null }; },
        };
        return b;
      }
      if (table === "connector_capability_assignments") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          then(resolve: (v: { data: unknown; error: null }) => void) {
            resolve({
              data: [{ autonomy: "execute", tenant_id: null, budget_limit_usd: null, current_usage_usd: 0, allowed_methods: ["browser"] }],
              error: null,
            });
          },
        };
        return builder;
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      };
    },
  };

  const capabilitiesToTest = [
    { cap: "browser.click", payload: { selector: "#submit-btn", queueOnly: true } },
    { cap: "browser.type", payload: { selector: "input[name=q]", text: "hello world", queueOnly: true } },
    { cap: "browser.key", payload: { key: "Enter", queueOnly: true } },
    { cap: "browser.scroll", payload: { direction: "down", amount: 300, queueOnly: true } },
    { cap: "browser.select", payload: { selector: "#country", value: "IN", queueOnly: true } },
    { cap: "browser.wait", payload: { condition: "timeout", timeoutMs: 100, queueOnly: true } },
    { cap: "browser.upload", payload: { selector: "input[type=file]", fileRef: "/tmp/doc.pdf", queueOnly: true } },
    { cap: "browser.download", payload: { triggerSelector: "#dl-btn", queueOnly: true } },
    { cap: "browser.tabs", payload: { action: "list", queueOnly: true } },
    { cap: "computer.open_app", payload: { appName: "notepad.exe", queueOnly: true } },
    { cap: "computer.click", payload: { x: 100, y: 200, queueOnly: true } },
    { cap: "computer.type", payload: { text: "desktop typing", queueOnly: true } },
    { cap: "computer.key", payload: { key: "Tab", queueOnly: true } },
    { cap: "computer.screenshot", payload: { queueOnly: true } },
    { cap: "computer.wait", payload: { ms: 50, queueOnly: true } },
  ];

  for (const { cap, payload } of capabilitiesToTest) {
    const res = await executeConnectorCapability(mockSupabase as never, {
      connectorKey: "founder_computer",
      capabilityKey: cap,
      tenantId: null,
      payload,
    });
    assert.equal(res.success, true, `Capability ${cap} must execute successfully`);
    const d = res.data as { status: string; capability: string };
    assert.equal(d.status, "queued");
    assert.equal(d.capability, cap);
  }

  console.log("✓ full browser & computer action catalog verified (all 15 action primitives)");
}

async function testCompanyAndAgentIsolation() {
  const connectionData = createMockConnection({
    profileId: "fc-isolated",
    sessionStatus: "ready",
    lastVerifiedAt: new Date().toISOString(),
  }, "connected");

  // Mock DB where capability assignment is denied for this agent
  const mockSupabaseDenied = {
    from(table: string) {
      if (table === "connector_connections") {
        const b: any = {
          select() { return b; }, eq() { return b; }, is() { return b; }, update() { return b; },
          async maybeSingle() { return { data: connectionData, error: null }; },
          async single() { return { data: connectionData, error: null }; },
        };
        return b;
      }
      if (table === "connector_capability_assignments") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          then(resolve: (v: { data: unknown; error: null }) => void) {
            resolve({
              data: [], // No matching assignment -> authorization denied!
              error: null,
            });
          },
        };
        return builder;
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      };
    },
  };

  await assert.rejects(
    async () => {
      await executeConnectorCapability(mockSupabaseDenied as never, {
        connectorKey: "founder_computer",
        capabilityKey: "browser.navigate",
        tenantId: "tenant-other-company",
        agentDefinitionId: "agent-unauthorized",
        payload: { url: "https://example.com" },
      });
    },
    (err: Error) => {
      assert.ok(err.name === "ConnectorNotAuthorizedError");
      return true;
    }
  );

  console.log("✓ company & agent authorization isolation verified (unassigned agent denied)");
}

async function runAll() {
  console.log("\n--- RUNNING FOUNDER COMPUTER TEST SUITE ---");
  await testRegistryDefinition();
  await testHealthProbeStates();
  await testSessionParsingAndMetadataBuilders();
  await testHonestCapabilityDiscovery();
  await testExecutionHandlers();
  await testRuntimePersistenceAndScrubbing();
  await testAllBrowserAndComputerActions();
  await testCompanyAndAgentIsolation();
  console.log("\nALL FOUNDER COMPUTER TESTS PASSED!\n");
}

runAll().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
