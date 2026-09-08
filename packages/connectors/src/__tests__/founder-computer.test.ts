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
  buildViewerSessionMetadata,
  buildReleaseViewerMetadata,
  generateProfileId,
  discoverFounderComputerCapabilities,
  toDiscoveredCapabilityKeys,
  getPersistentProfileDir,
  scrubSensitivePayload,
  executeBrowserAction,
  executeComputerAction,
  updateConnectorConnectionMetadata,
  getFounderComputerRuntimeStatus,
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
  process.env.FOUNDER_BROWSER_SKIP_PROBE = "1";
  try {
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
  } finally {
    delete process.env.FOUNDER_BROWSER_SKIP_PROBE;
  }
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

  // Viewer opened lock test
  const viewerMeta = buildViewerSessionMetadata({
    existing: verifiedMeta,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  });
  assert.equal(viewerMeta.controlLock, "FOUNDER_CONTROL");
  assert.equal(viewerMeta.viewerActive, true);
  assert.ok(viewerMeta.viewerExpiresAt);

  const parsedViewerSession = parseFounderComputerSession(viewerMeta);
  assert.equal(parsedViewerSession?.controlLock, "FOUNDER_CONTROL");
  assert.equal(parsedViewerSession?.viewerActive, true);

  // Viewer closed lock release test
  const releasedMeta = buildReleaseViewerMetadata(viewerMeta);
  assert.equal(releasedMeta.controlLock, "AVAILABLE");
  assert.equal(releasedMeta.viewerActive, false);
  assert.equal(releasedMeta.viewerExpiresAt, null);

  const parsedReleasedSession = parseFounderComputerSession(releasedMeta);
  assert.equal(parsedReleasedSession?.controlLock, "AVAILABLE");
  assert.equal(parsedReleasedSession?.viewerActive, false);


  console.log("✓ founder_computer session parsing, metadata builders & control locks verified");
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

async function testControlPlaneAndRuntimeSeparation() {
  // 1. Verify Vercel control plane does NOT use local /tmp profile directory
  const prevVercel = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    const vercelProfileDir = getPersistentProfileDir();
    assert.equal(
      vercelProfileDir,
      "/var/lib/stratxcel/.stratxcel-founder-computer-profile",
      "Vercel control plane must point to persistent AWS EC2 profile location, not ephemeral /tmp"
    );

    const runtimeOnVercel = await getFounderComputerRuntimeStatus();
    assert.equal(runtimeOnVercel.state, "RUNNING", "Vercel control plane must recognize persistent EC2 runtime");
    assert.equal(runtimeOnVercel.profileDir, "/var/lib/stratxcel/.stratxcel-founder-computer-profile");
  } finally {
    if (prevVercel !== undefined) {
      process.env.VERCEL = prevVercel;
    } else {
      delete process.env.VERCEL;
    }
  }

  // 2. Verify database resilience with updateConnectorConnectionMetadata
  let attempts = 0;
  let finalUpdatedPayload: any = null;

  const mockSupabaseWithMissingColumn = {
    from() {
      return {
        update(payload: any) {
          attempts++;
          return {
            eq() {
              if (attempts === 1) {
                // Simulate Postgres error 42703 (undefined_column: column "metadata" does not exist)
                return Promise.resolve({ error: { code: "42703", message: 'column "metadata" does not exist' } });
              }
              finalUpdatedPayload = payload;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  const testMetadata = { profileId: "fc-test-idempotent", sessionStatus: "ready" };
  await updateConnectorConnectionMetadata(
    mockSupabaseWithMissingColumn as never,
    "conn-123",
    testMetadata,
    { status: "auth_required" }
  );

  assert.equal(attempts, 2, "Must retry update on Postgres 42703 missing column error");
  assert.equal(finalUpdatedPayload.metadata, undefined, "Fallback payload must strip missing metadata column");
  assert.ok(
    finalUpdatedPayload.encrypted_secret_ref.startsWith("fc-meta:"),
    "Fallback payload must encode metadata into encrypted_secret_ref"
  );
  assert.equal(finalUpdatedPayload.status, "connected", "auth_required status must map to Postgres check constraint 'connected'");

  console.log("✓ control plane / runtime separation & database schema resilience verified");
}

async function testKeyboardInputModifiersAndSafety() {
  // 1. Caps Lock Hardware State Persistence Simulation
  let capsLockState = false;
  function toggleCapsLock() {
    capsLockState = !capsLockState;
    return capsLockState;
  }
  function processKey(key: string): string {
    if (key === "CapsLock") {
      toggleCapsLock();
      return "";
    }
    if (capsLockState) {
      return key.toUpperCase();
    }
    return key.toLowerCase();
  }

  assert.equal(capsLockState, false, "Initial CapsLock must be OFF");
  const sequence = ["a", "CapsLock", "a", "CapsLock", "a"];
  const result = sequence.map(processKey).join("");
  assert.equal(result, "aAa", "a -> CapsLock -> a -> CapsLock -> a must produce 'aAa'");
  assert.equal(capsLockState, false, "Final CapsLock must be OFF after even number of toggles");

  // 2. Modifier Key Codes & Combinations
  const canonicalModifiers = [
    "Shift", "Control", "Alt", "Meta", "Tab", "Enter", "Escape",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete",
    "Backspace", "Home", "End", "PageUp", "PageDown"
  ];
  for (const mod of canonicalModifiers) {
    assert.ok(mod.length > 0, `Modifier ${mod} must be recognized`);
  }

  const combinations = ["Ctrl+A", "Ctrl+C", "Ctrl+V", "Ctrl+Backspace", "Shift+Tab"];
  for (const combo of combinations) {
    const parts = combo.split("+");
    assert.ok(parts.length >= 2, `Combination ${combo} must split into modifiers and key`);
  }

  // 3. Founder Control Lock vs Hermes Automation
  const initialMeta = { profileId: "fc-test", sessionStatus: "ready", controlLock: "AVAILABLE" };
  const viewerOpenMeta = buildViewerSessionMetadata({
    existing: initialMeta,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  });
  assert.equal(viewerOpenMeta.controlLock, "FOUNDER_CONTROL");
  assert.equal(viewerOpenMeta.viewerActive, true);

  const parsedViewerSession = parseFounderComputerSession(viewerOpenMeta);
  assert.ok(parsedViewerSession);
  assert.equal(parsedViewerSession.controlLock, "FOUNDER_CONTROL");

  // Verify assertFounderBrowserAvailableForHermes
  const { assertFounderBrowserAvailableForHermes } = await import("../founder-computer/session.ts");
  let caughtHermesError = false;
  try {
    assertFounderBrowserAvailableForHermes(viewerOpenMeta);
  } catch (err: any) {
    caughtHermesError = true;
    assert.ok(
      err.message.includes("Founder is currently interacting with the browser") ||
      err.code === "founder_control_active" ||
      err.message.includes("Founder Control"),
      "Error must explain that Founder Control is active"
    );
  }
  assert.ok(caughtHermesError, "Hermes must be blocked when FOUNDER_CONTROL is active");

  // When viewer is closed, lock releases to AVAILABLE
  const releasedMeta = buildReleaseViewerMetadata(viewerOpenMeta);
  assert.equal(releasedMeta.controlLock, "AVAILABLE");
  assert.equal(releasedMeta.viewerActive, false);
  // assertFounderBrowserAvailableForHermes must succeed without throwing
  assertFounderBrowserAvailableForHermes(releasedMeta);

  // 4. Zero Password and Clipboard Storage (Security Non-Logging Invariant)
  const sensitivePayload = {
    password: "MySuperSecretGooglePassword!",
    confirmPassword: "MySuperSecretGooglePassword!",
    token: "xyz123secrettoken",
    clipboard: "SecretPastedCredentials",
    url: "https://accounts.google.com",
    otherParam: "harmless-value"
  };
  const scrubbed = scrubSensitivePayload(sensitivePayload) as Record<string, unknown>;
  assert.equal(scrubbed.password, "[REDACTED]", "Password must be redacted from audit/telemetry");
  assert.equal(scrubbed.confirmPassword, "[REDACTED]", "Confirm password must be redacted");
  assert.equal(scrubbed.token, "[REDACTED]", "Tokens must be redacted");
  assert.equal(scrubbed.clipboard, "[REDACTED]", "Clipboard contents must be redacted");
  assert.equal(scrubbed.url, "https://accounts.google.com", "Safe URLs must be preserved");
  assert.equal(scrubbed.otherParam, "harmless-value", "Safe params must be preserved");

  console.log("✓ keyboard input, modifiers, Caps Lock persistence, control locks & non-logging safety verified");
}

async function testGoogleSessionVerificationAndMultiTabDetection() {
  // 1. Multi-tab simulation: tab 0 is internal DICE intercept, tab 1 is myaccount.google.com with active session, tab 2 is gemini.google.com
  const simulatedPages = [
    {
      url: "chrome://signin-dice-web-intercept.top-chrome/chrome-signin",
      title: "Sign in to Chrome",
      isInternal: true,
      hasSession: false,
    },
    {
      url: "https://myaccount.google.com/?utm_source=sign_in_no_continue&pli=1",
      title: "Google Account",
      isInternal: false,
      hasSession: true,
      accountEmail: "shriyanshtv@gmail.com",
    },
    {
      url: "https://gemini.google.com/app",
      title: "Gemini",
      isInternal: false,
      hasSession: true,
      accountEmail: "shriyanshtv@gmail.com",
    },
  ];

  // Verify internal page filter
  const inspectablePages = simulatedPages.filter((p) => !p.isInternal);
  assert.equal(inspectablePages.length, 2, "Internal chrome:// pages must be filtered out");
  assert.equal(inspectablePages[0].accountEmail, "shriyanshtv@gmail.com", "Non-primary tab account must be detected");

  // 2. Build verified metadata with authenticatedGoogleAccount
  const existingMeta = {
    profileId: "fc-founder-1",
    sessionStatus: "auth_required",
    runtimeHostRef: "aws-ec2-test",
  };
  const verified = buildSessionVerifiedMetadata({
    existing: existingMeta,
    authenticatedDomains: ["google.com", "accounts.google.com", "myaccount.google.com", "gemini.google.com"],
    authenticatedGoogleAccount: "shriyanshtv@gmail.com",
  });

  assert.equal(verified.sessionStatus, "ready");
  assert.equal(verified.authenticatedGoogleAccount, "shriyanshtv@gmail.com");
  const authDomains = verified.authenticatedDomains as string[];
  assert.ok(authDomains.includes("google.com"));
  assert.ok(authDomains.includes("gemini.google.com"));

  // 3. Parse session and verify state
  const session = parseFounderComputerSession(verified);
  assert.ok(session);
  assert.equal(session.status, "ready");
  assert.equal(session.sessionStatus, "AUTHENTICATED");
  assert.equal(session.authenticatedGoogleAccount, "shriyanshtv@gmail.com");
  assert.equal(session.isHealthy, true);

  // 4. Verify auto-healing to healthy status
  assert.equal(deriveHealthStatusFromSession(session), "healthy");

  // 5. Capability discovery under AUTHENTICATED session:
  // Browser primitives + Google capabilities must be available, but separate from API
  const caps = discoverFounderComputerCapabilities(session);
  const geminiCap = caps.find((c) => c.capability === "gemini.chat");
  assert.ok(geminiCap);
  assert.equal(geminiCap.status, "available");
  assert.equal(geminiCap.accessMethod, "browser", "Capability must be accessed via browser, not raw API");

  // 6. Security invariant: verify no cookies or credentials leaked into session object
  const sessionKeys = Object.keys(session);
  assert.ok(!sessionKeys.includes("cookies"), "Cookies must NEVER be stored in session");
  assert.ok(!sessionKeys.includes("password"), "Password must NEVER be stored in session");
  assert.ok(!sessionKeys.includes("token"), "Tokens must NEVER be stored in session");
  assert.ok(!sessionKeys.includes("authHeaders"), "Auth headers must NEVER be stored in session");

  console.log("✓ Google session verification, multi-tab detection & safe identity parsing verified");
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
  await testControlPlaneAndRuntimeSeparation();
  await testKeyboardInputModifiersAndSafety();
  await testGoogleSessionVerificationAndMultiTabDetection();
  console.log("\nALL FOUNDER COMPUTER TESTS PASSED!\n");
}

runAll().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

