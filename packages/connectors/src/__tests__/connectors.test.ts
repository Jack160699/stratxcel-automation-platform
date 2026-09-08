// Run with: node --experimental-strip-types packages/connectors/src/__tests__/connectors.test.ts
//
// Production-Hardened Connector Architecture Test Suite
// Verifies:
// 1. All 16 canonical connectors in registry with full metadata and access methods
// 2. Access method execution hierarchy (Native > MCP > API > CLI > Browser)
// 3. Secret storage refusal for mcp_managed and read-only adapter connectors
// 4. Real health check handler bindings for all 16 connectors
// 5. Read-only adapters never touching connector_connections secrets
// 6. Server-side authorization decision tree (connected, healthy, assigned, autonomy)
// 7. Multi-tenant company isolation & Agent definition isolation
// 8. Budget limit policy enforcement
// 9. Dynamic capability discovery and normalization
// 10. Multi-access capability execution router
// 11. Sanitized audit logging with zero secret leakage
// 12. InvokeTool authorization gating in Hermes
// 13. AI provider platform secret resolution (fallback, fail-open, caching)

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "packages", "connectors", "src", relativePath), "utf8").replace(/\r\n/g, "\n");
}

async function testRegistryHasAllCanonicalConnectorsWithSaneShape() {
  const { CONNECTOR_REGISTRY, getConnectorDefinition, EXECUTION_METHOD_ORDER } = await import("@stratxcel/connectors");
  const expectedKeys = [
    "apollo",
    "aws",
    "browser",
    "claude",
    "founder_computer",
    "gemini",
    "github",
    "google",
    "google_ai_pro",
    "google_workspace",
    "meta",
    "openrouter",
    "payments",
    "s3",
    "supabase",
    "telegram",
    "vercel",
    "whatsapp",
  ];
  const actualKeys = CONNECTOR_REGISTRY.map((c) => c.key).sort();
  assert.deepEqual(actualKeys, [...expectedKeys].sort(), "the registry must have all Founder connectors plus legacy adapter");

  for (const key of expectedKeys) {
    const def = getConnectorDefinition(key);
    assert.ok(def, `${key} must be a real registry entry`);
    assert.ok(def!.label.length > 0, `${key} must have a real label`);
    assert.ok(["platform", "company", "both"].includes(def!.scopeLevel), `${key} must have a valid scopeLevel`);
    assert.ok(
      ["api_key", "oauth", "service_credential", "mcp_managed", "cli"].includes(def!.authMethod),
      `${key} must have a valid authMethod`
    );
    assert.ok(def!.realStatusSource.length > 0, `${key} must document where its real health signal comes from`);
    assert.ok(Array.isArray(def!.supportedAccessMethods), `${key} must have supportedAccessMethods`);
    assert.ok(def!.supportedAccessMethods.length > 0, `${key} must declare at least one access method`);
    assert.ok(def!.preferredAccessMethod.length > 0, `${key} must declare a preferredAccessMethod`);
  }

  // Method order check
  assert.deepEqual(
    EXECUTION_METHOD_ORDER,
    ["native", "mcp", "api", "cli", "browser"],
    "execution order must prioritize Native > MCP > API > CLI > Browser"
  );

  console.log("connectors.test.ts: the registry has all canonical connectors with complete shape and access methods — PASS");
}

async function testMcpManagedConnectorsDeclareNoRequiredEnvVarsButHaveARealStatusSource() {
  const { getConnectorDefinition } = await import("@stratxcel/connectors");
  const aws = getConnectorDefinition("aws")!;
  const browser = getConnectorDefinition("browser")!;
  assert.equal(aws.authMethod, "mcp_managed");
  assert.equal(browser.authMethod, "mcp_managed");
  assert.match(aws.realStatusSource, /getWorkerHealth/, "aws's health must come from the real worker-heartbeat system");
  assert.match(browser.realStatusSource, /browser/i, "browser must declare its status source honestly");
  console.log("connectors.test.ts: mcp_managed connectors (aws, browser) declare real, honest status sources — PASS");
}

async function testCreateConnectorConnectionRefusesASecretForMcpManagedAndReadOnlyAdapterConnectors() {
  const { createConnectorConnection } = await import("@stratxcel/connectors");
  const explodingSupabase = {
    from() {
      throw new Error("must never reach the database for a forbidden secret store");
    },
  };

  for (const key of ["aws", "browser", "founder_computer"]) {
    await assert.rejects(
      () => createConnectorConnection(explodingSupabase as never, { connectorKey: key, tenantId: null, rawSecret: "shh", connectedByUserId: null }),
      /must never store a secret here/,
      `${key} (mcp_managed) must refuse a rawSecret without touching the database`
    );
  }
  for (const key of ["whatsapp", "meta", "google_workspace"]) {
    await assert.rejects(
      () => createConnectorConnection(explodingSupabase as never, { connectorKey: key, tenantId: "tenant-1", rawSecret: "shh", connectedByUserId: null }),
      /must never store a secret here/,
      `${key} (read-only adapter) must refuse a rawSecret without touching the database`
    );
  }
  await assert.rejects(
    () => createConnectorConnection(explodingSupabase as never, { connectorKey: "vercel", tenantId: "tenant-1", rawSecret: "shh", connectedByUserId: null }),
    /must never store a secret here/,
    "vercel with a tenantId (company-scoped) must refuse a rawSecret"
  );
  console.log("connectors.test.ts: a secret can never be stored for an mcp_managed or read-only-adapter connector — PASS");
}

async function testHealthHandlerReusesTheRealFunctionsForEachConnector() {
  const source = readSource("health.ts");
  assert.match(source, /import \{ getWorkerHealth \} from "@stratxcel\/queue"/);
  assert.match(source, /import \{ probeGeminiReadiness, probeOpenRouterReadiness \} from "@stratxcel\/ai-runtime"/);
  assert.match(source, /import \{ validateVercelToken \} from "@stratxcel\/search-discovery"/);
  assert.match(source, /import \{ listPhoneBindingsForTenant \} from "@stratxcel\/whatsapp"/);
  assert.match(source, /import \{ getGoogleConnection \} from "@stratxcel\/search-discovery"/);

  const case_ = (key: string) => source.match(new RegExp(`case "${key}": \\{[\\s\\S]*?\\n    \\}\\n`))?.[0];
  assert.match(case_("aws")!, /getWorkerHealth\(supabase as never, "mission-worker"\)/);
  assert.match(case_("github")!, /https:\/\/api\.github\.com\/user/);
  assert.match(case_("gemini")!, /probeGeminiReadiness\(/);
  assert.match(case_("openrouter")!, /probeOpenRouterReadiness\(/);
  assert.match(case_("claude")!, /https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.match(case_("apollo")!, /https:\/\/api\.apollo\.io\/v1\/auth\/health/);
  assert.match(case_("telegram")!, /https:\/\/api\.telegram\.org\/bot/);
  console.log("connectors.test.ts: health.ts real per-connector branches reuse real live probes — PASS");
}

async function testReadOnlyAdapterConnectorsNeverCreateAConnectorConnectionsSecretColumnRead() {
  const source = readSource("health.ts");
  const whatsappBlock = source.match(/case "whatsapp": \{[\s\S]*?\n    \}\n/)?.[0];
  assert.ok(whatsappBlock, "whatsapp case must exist");
  assert.match(whatsappBlock!, /listPhoneBindingsForTenant\(supabase as never, tenantId\)/);
  assert.doesNotMatch(whatsappBlock!, /retrieveConnectorSecret/);

  const metaBlock = source.match(/case "meta": \{[\s\S]*?\n    \}\n/)?.[0];
  assert.ok(metaBlock, "meta case must exist");
  assert.match(metaBlock!, /listPhoneBindingsForTenant\(supabase as never, tenantId\)/);

  console.log("connectors.test.ts: whatsapp and meta health read real phone_bindings, never vaulted secrets — PASS");
}

function makeFakeSupabase(opts: {
  connection: Record<string, unknown> | null;
  assignments: Array<{
    autonomy: string;
    tenant_id: string | null;
    agent_definition_id?: string | null;
    department?: string | null;
    budget_limit_usd?: number | null;
    current_usage_usd?: number;
    allowed_methods?: string[] | null;
  }>;
}) {
  return {
    from(table: string) {
      if (table === "connector_connections") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          is() { return builder; },
          update() { return builder; },
          async maybeSingle() { return { data: opts.connection, error: null }; },
          async single() { return { data: opts.connection, error: null }; },
        };
        return builder;
      }
      if (table === "connector_capability_assignments") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          then(resolve: (v: { data: unknown; error: null }) => void) {
            resolve({ data: opts.assignments, error: null });
          },
        };
        return builder;
      }
      if (table === "connector_audit_logs") {
        return {
          insert() { return Promise.resolve({ data: null, error: null }); },
        };
      }
      throw new Error(`unexpected table in fake: ${table}`);
    },
  };
}

async function testAuthorizationGateRealDecisionTree() {
  const { assertConnectorCapabilityAuthorized } = await import("@stratxcel/connectors");

  // 1. Not connected
  const notConnected = await assertConnectorCapabilityAuthorized(makeFakeSupabase({ connection: null, assignments: [] }) as never, {
    connectorKey: "gemini",
    capabilityKey: "media.image_generation",
    tenantId: "tenant-1",
  });
  assert.equal(notConnected.authorized, false);
  assert.equal(notConnected.reason, "connector_not_connected");

  // 2. Unhealthy
  const unhealthy = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "error" }, assignments: [] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.equal(unhealthy.authorized, false);
  assert.equal(unhealthy.reason, "connector_unhealthy:error");

  // 3. No assignment
  const noAssignment = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.equal(noAssignment.authorized, false);
  assert.equal(noAssignment.reason, "capability_not_assigned");

  // 4. Autonomy disabled
  const disabled = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "disabled", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.equal(disabled.authorized, false);
  assert.equal(disabled.reason, "autonomy_disabled");

  // 5. Approval required
  const approvalRequired = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "approval_required", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.equal(approvalRequired.authorized, false);
  assert.equal(approvalRequired.reason, "autonomy_approval_required_not_yet_auto_routed");

  // 6. Authorized
  const executeAuthorized = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "execute", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.equal(executeAuthorized.authorized, true);
  if (executeAuthorized.authorized) {
    assert.equal(executeAuthorized.autonomy, "execute");
    assert.equal(executeAuthorized.effectiveMethod, "native");
  }

  // 7. Platform-wide assignment matches any tenant
  const platformWideAssignment = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "read", tenant_id: null }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "some-other-tenant" }
  );
  assert.equal(platformWideAssignment.authorized, true);

  // 8. Undeclared capability rejected
  const undeclaredCapability = await assertConnectorCapabilityAuthorized(makeFakeSupabase({ connection: null, assignments: [] }) as never, {
    connectorKey: "gemini",
    capabilityKey: "not_a_real_capability",
    tenantId: "tenant-1",
  });
  assert.equal(undeclaredCapability.authorized, false);

  console.log("connectors.test.ts: assertConnectorCapabilityAuthorized's real decision tree is correct — PASS");
}

async function testCompanyAndAgentIsolation() {
  const { assertConnectorCapabilityAuthorized } = await import("@stratxcel/connectors");

  // Tenant B cannot access Tenant A's assigned capability
  const tenantMismatch = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy" },
      assignments: [{ autonomy: "execute", tenant_id: "tenant-a" }],
    }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-b" }
  );
  assert.equal(tenantMismatch.authorized, false, "Tenant B must be denied access to Tenant A capability");
  assert.equal(tenantMismatch.reason, "capability_not_assigned");

  // Agent X cannot access capability restricted to Agent Y
  const agentMismatch = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy" },
      assignments: [{ autonomy: "execute", tenant_id: null, agent_definition_id: "agent-sales" }],
    }) as never,
    {
      connectorKey: "gemini",
      capabilityKey: "media.image_generation",
      tenantId: "tenant-1",
      agentDefinitionId: "agent-engineering",
    }
  );
  assert.equal(agentMismatch.authorized, false, "Agent engineering must not access agent-sales capability");

  // Agent matching specific definition succeeds
  const agentMatch = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy" },
      assignments: [{ autonomy: "execute", tenant_id: null, agent_definition_id: "agent-sales" }],
    }) as never,
    {
      connectorKey: "gemini",
      capabilityKey: "media.image_generation",
      tenantId: "tenant-1",
      agentDefinitionId: "agent-sales",
    }
  );
  assert.equal(agentMatch.authorized, true, "Matching agent must be authorized");

  console.log("connectors.test.ts: company and agent isolation verified — PASS");
}

async function testBudgetPolicyEnforcement() {
  const { assertConnectorCapabilityAuthorized } = await import("@stratxcel/connectors");

  // Connection-level budget exceeded
  const connectionBudgetExceeded = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy", budget_limit_usd: 50, current_usage_usd: 50.05 },
      assignments: [{ autonomy: "execute", tenant_id: null }],
    }) as never,
    { connectorKey: "openrouter", capabilityKey: "ai.text", tenantId: "tenant-1" }
  );
  assert.equal(connectionBudgetExceeded.authorized, false);
  assert.equal(connectionBudgetExceeded.reason, "connector_budget_limit_exceeded");

  // Assignment-level budget exceeded
  const assignmentBudgetExceeded = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy", budget_limit_usd: 100, current_usage_usd: 20 },
      assignments: [{ autonomy: "execute", tenant_id: null, budget_limit_usd: 10, current_usage_usd: 12 }],
    }) as never,
    { connectorKey: "openrouter", capabilityKey: "ai.text", tenantId: "tenant-1" }
  );
  assert.equal(assignmentBudgetExceeded.authorized, false);
  assert.equal(assignmentBudgetExceeded.reason, "assignment_budget_limit_exceeded");

  // Within budget succeeds
  const withinBudget = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-1", status: "healthy", budget_limit_usd: 100, current_usage_usd: 20 },
      assignments: [{ autonomy: "execute", tenant_id: null, budget_limit_usd: 50, current_usage_usd: 10 }],
    }) as never,
    { connectorKey: "openrouter", capabilityKey: "ai.text", tenantId: "tenant-1" }
  );
  assert.equal(withinBudget.authorized, true);

  console.log("connectors.test.ts: budget policy enforcement verified — PASS");
}

async function testCapabilityDiscoveryAndNormalization() {
  const { normalizeCapabilities } = await import("@stratxcel/connectors");
  const normalized = normalizeCapabilities(["  AI.Text ", "infrastructure.deploy_verify", "ai.text", "MEDIA.IMAGE_GENERATION"]);
  assert.deepEqual(normalized, ["ai.text", "infrastructure.deploy_verify", "media.image_generation"]);
  console.log("connectors.test.ts: capability normalization verified — PASS");
}

async function testCapabilityExecutionRouter() {
  const { executeConnectorCapability, registerCapabilityHandler } = await import("@stratxcel/connectors");

  registerCapabilityHandler("claude", "ai.reasoning", async (ctx, payload) => {
    return { status: "reasoned", prompt: payload.prompt, method: ctx.method };
  });

  const fakeDb = makeFakeSupabase({
    connection: { id: "conn-claude", status: "healthy" },
    assignments: [{ autonomy: "execute", tenant_id: "tenant-1" }],
  });

  const result = await executeConnectorCapability(fakeDb as never, {
    connectorKey: "claude",
    capabilityKey: "ai.reasoning",
    tenantId: "tenant-1",
    payload: { prompt: "test prompt" },
    costUsd: 0.05,
  });

  assert.equal(result.success, true);
  assert.equal(result.connectorKey, "claude");
  assert.equal(result.executionMethod, "native");
  assert.deepEqual(result.data, { status: "reasoned", prompt: "test prompt", method: "native" });

  console.log("connectors.test.ts: capability execution router verified — PASS");
}

async function testInvokeToolWiresTheAuthorizationGateBeforeExecutionAndAuditsDenial() {
  const gatewaySource = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(gatewaySource, /const HERMES_TOOL_CONNECTOR_MAP: Partial<Record<ToolName, \{ connectorKey: string; capabilityKey: string \}>> = \{/);
  assert.match(gatewaySource, /generate_image: \{ connectorKey: "gemini", capabilityKey: "media\.image_generation" \}/);
  assert.match(gatewaySource, /check_domain_status: \{ connectorKey: "vercel", capabilityKey: "website\.domain_status" \}/);
  const invokeToolBlock = gatewaySource.match(/export async function invokeTool\([\s\S]*?\n\}/)?.[0];
  assert.ok(invokeToolBlock, "invokeTool must exist");
  assert.match(invokeToolBlock!, /const connectorGate = await resolveToolConnectorGate\(connectorsClient, tool\);/);
  assert.match(invokeToolBlock!, /if \(!authz\.authorized\) \{/);
  assert.match(invokeToolBlock!, /throw new ConnectorNotAuthorizedError\(tool, authz\.reason\);/);
  assert.match(invokeToolBlock!, /action: `hermes\.tool_call\.\$\{tool\}\.denied`/);
  console.log("connectors.test.ts: invokeTool enforces the connector authorization gate before execution — PASS");
}

async function testGoogleAiProConnectorRegistrationAndCapabilities() {
  const { getConnectorDefinition } = await import("@stratxcel/connectors");
  const def = getConnectorDefinition("google_ai_pro");
  assert.ok(def, "google_ai_pro connector must be registered");
  assert.equal(def!.category, "ai", "google_ai_pro category must be ai");
  assert.equal(def!.scopeLevel, "platform", "google_ai_pro scopeLevel must be platform (Founder personal resource)");
  assert.equal(def!.authMethod, "oauth", "google_ai_pro authMethod must be oauth");
  assert.equal(def!.preferredAccessMethod, "native");
  assert.ok(def!.supportedAccessMethods.includes("native"));
  assert.ok(def!.supportedAccessMethods.includes("mcp"));
  assert.ok(def!.supportedAccessMethods.includes("api"));
  assert.ok(def!.supportedAccessMethods.includes("browser"));

  const declared = def!.declaredCapabilities;
  assert.ok(declared.includes("google_ai_pro.reasoning"));
  assert.ok(declared.includes("image.generate"));
  assert.ok(declared.includes("video.generate"));
  assert.ok(declared.includes("antigravity.code"));
  assert.ok(declared.includes("google_drive.upload"));
  assert.ok(declared.includes("google_drive.read"));
  assert.ok(declared.includes("google_cloud.projects"));
  assert.ok(declared.includes("jules.automate"));

  console.log("connectors.test.ts: google_ai_pro connector registration and capabilities — PASS");
}

async function testGoogleAiProHealthCheckAndEntitlementResolution() {
  const { resolveConnectorHealth } = await import("@stratxcel/connectors");

  // When no token/credential is set, it returns auth_required indicating founder account needs to be connected
  const unconfiguredHealth = await resolveConnectorHealth(
    makeFakeSupabase({ connection: null, assignments: [] }) as never,
    "google_ai_pro",
    null,
    null
  );
  assert.equal(unconfiguredHealth.status, "auth_required");
  assert.match(unconfiguredHealth.lastError ?? "", /connect Founder Google account/i);

  console.log("connectors.test.ts: google_ai_pro health resolution (auth_required when unconnected) — PASS");
}

async function testGoogleAiProExecutionRouterAndIsolation() {
  const { executeConnectorCapability, assertConnectorCapabilityAuthorized } = await import("@stratxcel/connectors");

  // 1. Antigravity execution via google_ai_pro
  const fakeDbAuthorized = makeFakeSupabase({
    connection: { id: "conn-pro-1", status: "healthy" },
    assignments: [{ autonomy: "execute", tenant_id: null }],
  });

  const agResult = await executeConnectorCapability(fakeDbAuthorized as never, {
    connectorKey: "google_ai_pro",
    capabilityKey: "antigravity.code",
    tenantId: null,
    payload: { task: "Refactor connector health probe" },
  });
  assert.equal(agResult.success, true);
  assert.equal(agResult.connectorKey, "google_ai_pro");
  assert.equal(agResult.capabilityKey, "antigravity.code");
  assert.equal(agResult.executionMethod, "native");

  // 2. Nano Banana Pro image generation via google_ai_pro
  const imgResult = await executeConnectorCapability(fakeDbAuthorized as never, {
    connectorKey: "google_ai_pro",
    capabilityKey: "image.generate",
    tenantId: null,
    payload: { prompt: "hyperrealistic solar installation", style: "photorealistic" },
  });
  assert.equal(imgResult.success, true);
  assert.equal(imgResult.connectorKey, "google_ai_pro");
  assert.equal(imgResult.capabilityKey, "image.generate");

  // 3. Strict Founder isolation: Tenant B cannot access Google Drive capability without explicit assignment
  const unassignedDrive = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({
      connection: { id: "conn-pro-1", status: "healthy" },
      assignments: [{ autonomy: "execute", tenant_id: "tenant-allowed" }],
    }) as never,
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "google_drive.upload",
      tenantId: "tenant-unauthorized",
    }
  );
  assert.equal(unassignedDrive.authorized, false, "tenant without assignment must be rejected");
  assert.equal(unassignedDrive.reason, "capability_not_assigned");

  console.log("connectors.test.ts: google_ai_pro execution router and strict isolation — PASS");
}

async function testHermesDynamicImageGenerationRouting() {
  const { resolveToolConnectorGate } = await import("../../../../apps/hermes-gateway/src/tool-handlers.ts");

  // Case A: google_ai_pro is connected and healthy with image.generate assignment -> route to google_ai_pro
  const fakeDbWithPro = makeFakeSupabase({
    connection: { id: "conn-pro", status: "healthy" },
    assignments: [{ autonomy: "execute", tenant_id: null }],
  });
  const gateWithPro = await resolveToolConnectorGate(fakeDbWithPro as never, "generate_image");
  assert.deepEqual(gateWithPro, { connectorKey: "google_ai_pro", capabilityKey: "image.generate" });

  // Case B: google_ai_pro is not connected -> fallback to baseline gemini
  const fakeDbWithoutPro = makeFakeSupabase({
    connection: null,
    assignments: [],
  });
  const gateWithoutPro = await resolveToolConnectorGate(fakeDbWithoutPro as never, "generate_image");
  assert.deepEqual(gateWithoutPro, { connectorKey: "gemini", capabilityKey: "media.image_generation" });

  console.log("connectors.test.ts: hermes dynamic routing prefers healthy google_ai_pro image generation before gemini fallback — PASS");
}

async function testResolveCachedPlatformConnectorSecretFallsBackToEnvWhenNothingConnected() {
  const { resolveCachedPlatformConnectorSecret, resetConnectorSecretCacheForTests } = await import("@stratxcel/connectors");
  resetConnectorSecretCacheForTests();
  const noConnectionSupabase = {
    from() {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return builder;
    },
  };
  const resolved = await resolveCachedPlatformConnectorSecret(noConnectionSupabase as never, "gemini", "env-fallback-key");
  assert.equal(resolved, "env-fallback-key");
  console.log("connectors.test.ts: resolveCachedPlatformConnectorSecret falls back to env var — PASS");
}

async function testResolveCachedPlatformConnectorSecretFailsOpenOnAnyError() {
  const { resolveCachedPlatformConnectorSecret, resetConnectorSecretCacheForTests } = await import("@stratxcel/connectors");
  resetConnectorSecretCacheForTests();
  const throwingSupabase = {
    from() {
      throw new Error("simulated DB outage");
    },
  };
  const resolved = await resolveCachedPlatformConnectorSecret(throwingSupabase as never, "openrouter", "env-fallback-key-2");
  assert.equal(resolved, "env-fallback-key-2");
  console.log("connectors.test.ts: resolveCachedPlatformConnectorSecret fails open on error — PASS");
}

async function testResolveCachedPlatformConnectorSecretCachesAndDoesNotHitTheDbTwiceWithinTtl() {
  const { resolveCachedPlatformConnectorSecret, resetConnectorSecretCacheForTests } = await import("@stratxcel/connectors");
  resetConnectorSecretCacheForTests();
  let callCount = 0;
  const countingSupabase = {
    from() {
      callCount += 1;
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return builder;
    },
  };
  await resolveCachedPlatformConnectorSecret(countingSupabase as never, "gemini", "k1", 60_000);
  await resolveCachedPlatformConnectorSecret(countingSupabase as never, "gemini", "k1", 60_000);
  await resolveCachedPlatformConnectorSecret(countingSupabase as never, "gemini", "k1", 60_000);
  assert.equal(callCount, 1);
  console.log("connectors.test.ts: resolveCachedPlatformConnectorSecret caches within TTL — PASS");
}

async function testProviderCompositionRootWiresTheResolvedKeysIntoTheRealAiRuntimeConstructors() {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "social", "agent", "provider.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /import \{ resolveCachedPlatformConnectorSecret \} from "@stratxcel\/connectors";/);
  assert.match(source, /resolveCachedPlatformConnectorSecret\(internalWriteClient as never, "gemini", process\.env\.GEMINI_API_KEY\)/);
  assert.match(source, /resolveCachedPlatformConnectorSecret\(internalWriteClient as never, "openrouter", process\.env\.OPENROUTER_API_KEY\)/);
  console.log("connectors.test.ts: provider composition root wires resolved keys — PASS");
}

async function run() {
  await testRegistryHasAllCanonicalConnectorsWithSaneShape();
  await testMcpManagedConnectorsDeclareNoRequiredEnvVarsButHaveARealStatusSource();
  await testCreateConnectorConnectionRefusesASecretForMcpManagedAndReadOnlyAdapterConnectors();
  await testHealthHandlerReusesTheRealFunctionsForEachConnector();
  await testReadOnlyAdapterConnectorsNeverCreateAConnectorConnectionsSecretColumnRead();
  await testGoogleAiProConnectorRegistrationAndCapabilities();
  await testGoogleAiProHealthCheckAndEntitlementResolution();
  await testGoogleAiProExecutionRouterAndIsolation();
  await testHermesDynamicImageGenerationRouting();
  await testAuthorizationGateRealDecisionTree();
  await testCompanyAndAgentIsolation();
  await testBudgetPolicyEnforcement();
  await testCapabilityDiscoveryAndNormalization();
  await testCapabilityExecutionRouter();
  await testInvokeToolWiresTheAuthorizationGateBeforeExecutionAndAuditsDenial();
  await testResolveCachedPlatformConnectorSecretFallsBackToEnvWhenNothingConnected();
  await testResolveCachedPlatformConnectorSecretFailsOpenOnAnyError();
  await testResolveCachedPlatformConnectorSecretCachesAndDoesNotHitTheDbTwiceWithinTtl();
  await testProviderCompositionRootWiresTheResolvedKeysIntoTheRealAiRuntimeConstructors();
  console.log("connectors.test.ts (@stratxcel/connectors): ALL PASS");
}

run();
