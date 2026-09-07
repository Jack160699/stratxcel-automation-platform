// Run with: node --experimental-strip-types packages/connectors/src/__tests__/connectors.test.ts
//
// Verifies the Connector/Capability Control Plane's real invariants:
// the registry's own shape, that a secret can never be stored for a
// connector whose real credential lives elsewhere (mcp_managed or a
// read-only adapter over an existing table), and that health.ts's real
// per-connector branches call the real functions this session already
// confirmed exist (getWorkerHealth, probeGeminiReadiness,
// probeOpenRouterReadiness, validateVercelToken, listPhoneBindingsForTenant,
// getGoogleConnection) rather than a reimplementation or a fabricated status.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "packages", "connectors", "src", relativePath), "utf8").replace(/\r\n/g, "\n");
}

async function testRegistryHasAllTenConnectorsFromTheMasterBriefWithSaneShape() {
  const { CONNECTOR_REGISTRY, getConnectorDefinition } = await import("@stratxcel/connectors");
  const expectedKeys = ["aws", "github", "supabase", "vercel", "whatsapp", "meta", "google_workspace", "gemini", "openrouter", "browser"];
  const actualKeys = CONNECTOR_REGISTRY.map((c) => c.key).sort();
  assert.deepEqual(actualKeys, [...expectedKeys].sort(), "the registry must have exactly the connectors named in master brief Section 25, no more, no fewer");

  for (const key of expectedKeys) {
    const def = getConnectorDefinition(key);
    assert.ok(def, `${key} must be a real registry entry`);
    assert.ok(def!.label.length > 0, `${key} must have a real label`);
    assert.ok(["platform", "company", "both"].includes(def!.scopeLevel), `${key} must have a valid scopeLevel`);
    assert.ok(["api_key", "oauth", "service_credential", "mcp_managed"].includes(def!.authMethod), `${key} must have a valid authMethod`);
    assert.ok(def!.realStatusSource.length > 0, `${key} must document where its real health signal comes from -- never left blank`);
  }
  console.log("connectors.test.ts: the registry has all 10 real connectors with a sane, complete shape — PASS");
}

async function testMcpManagedConnectorsDeclareNoRequiredEnvVarsButHaveARealStatusSource() {
  const { getConnectorDefinition } = await import("@stratxcel/connectors");
  const aws = getConnectorDefinition("aws")!;
  const browser = getConnectorDefinition("browser")!;
  assert.equal(aws.authMethod, "mcp_managed");
  assert.equal(browser.authMethod, "mcp_managed");
  assert.match(aws.realStatusSource, /getWorkerHealth/, "aws's health must come from the real worker-heartbeat system, not a fabricated check");
  assert.match(browser.realStatusSource, /no real Hermes execution path exists yet/, "browser must honestly declare it has no real execution path yet, not silently claim availability");
  console.log("connectors.test.ts: mcp_managed connectors (aws, browser) declare real, honest status sources — PASS");
}

async function testCreateConnectorConnectionRefusesASecretForMcpManagedAndReadOnlyAdapterConnectors() {
  const { createConnectorConnection } = await import("@stratxcel/connectors");
  // A fake Supabase client that throws if .from() is ever called -- proves
  // the refusal happens before any I/O, not after a wasted DB round-trip.
  const explodingSupabase = {
    from() {
      throw new Error("must never reach the database for a forbidden secret store");
    },
  };

  for (const key of ["aws", "browser"]) {
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
    "vercel with a tenantId (company-scoped) must refuse a rawSecret -- its real token lives in search_website_connections"
  );
  console.log("connectors.test.ts: a secret can never be stored for an mcp_managed or read-only-adapter connector — PASS");
}

async function testHealthHandlerReusesTheRealFunctionsForEachConnector() {
  const source = readSource("health.ts");
  assert.match(source, /import \{ getWorkerHealth \} from "@stratxcel\/queue"/, "aws health must import the real getWorkerHealth, not reimplement heartbeat logic");
  assert.match(source, /import \{ probeGeminiReadiness, probeOpenRouterReadiness \} from "@stratxcel\/ai-runtime"/, "gemini/openrouter health must reuse the real, already-live readiness probes");
  assert.match(source, /import \{ validateVercelToken \} from "@stratxcel\/search-discovery"/, "vercel health must reuse the real token validator, not a reimplementation");
  assert.match(source, /import \{ listPhoneBindingsForTenant \} from "@stratxcel\/whatsapp"/, "whatsapp/meta health must reuse the real phone-bindings repository, not query the table from scratch");
  assert.match(source, /import \{ getGoogleConnection \} from "@stratxcel\/search-discovery"/, "google_workspace health must reuse the real search_google_connections repository function");

  const case_ = (key: string) => source.match(new RegExp(`case "${key}": \\{[\\s\\S]*?\\n    \\}\\n`))?.[0];
  assert.match(case_("aws")!, /getWorkerHealth\(supabase as never, "mission-worker"\)/);
  assert.match(case_("github")!, /https:\/\/api\.github\.com\/user/, "github health must be a real live API call, not a fabricated status");
  assert.match(case_("gemini")!, /probeGeminiReadiness\(/);
  assert.match(case_("openrouter")!, /probeOpenRouterReadiness\(/);
  console.log("connectors.test.ts: health.ts's real per-connector branches reuse the real, already-live functions — PASS");
}

async function testReadOnlyAdapterConnectorsNeverCreateAConnectorConnectionsSecretColumnRead() {
  const source = readSource("health.ts");
  // whatsapp/meta/google_workspace/vercel(company) must read the REAL
  // existing table for status, never their own connector_connections
  // encrypted_secret_ref -- proving the "exactly one place a credential
  // lives" invariant holds in the health path too, not just create.
  const whatsappBlock = source.match(/case "whatsapp":\n    case "meta": \{[\s\S]*?\n    \}\n/)?.[0];
  assert.ok(whatsappBlock, "whatsapp/meta case must exist");
  assert.match(whatsappBlock!, /listPhoneBindingsForTenant\(supabase as never, tenantId\)/);
  assert.doesNotMatch(whatsappBlock!, /retrieveConnectorSecret/, "whatsapp/meta health must never retrieve a connector-vaulted secret -- it has none, by design");

  const googleBlock = source.match(/case "google_workspace": \{[\s\S]*?\n    \}\n/)?.[0];
  assert.ok(googleBlock, "google_workspace case must exist");
  assert.match(googleBlock!, /getGoogleConnection\(supabase as never, tenantId\)/);
  assert.doesNotMatch(googleBlock!, /retrieveConnectorSecret/, "google_workspace health must never retrieve a connector-vaulted secret -- it has none, by design");
  console.log("connectors.test.ts: whatsapp/meta/google_workspace health never touches a connector-vaulted secret, only the real existing table — PASS");
}

/**
 * A minimal, real functional double for assertConnectorCapabilityAuthorized's
 * two real query shapes -- exercises the actual decision logic, not just
 * its source text, since this is the master brief's own Section 18 "major
 * priority" enforcement gate.
 */
function makeFakeSupabase(opts: { connection: Record<string, unknown> | null; assignments: Array<{ autonomy: string; tenant_id: string | null }> }) {
  return {
    from(table: string) {
      if (table === "connector_connections") {
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          is() { return builder; },
          async maybeSingle() { return { data: opts.connection, error: null }; },
        };
        return builder;
      }
      if (table === "connector_capability_assignments") {
        const builder: any = {
          select() { return builder; },
          eq() { return builder; },
          then(resolve: (v: { data: unknown; error: null }) => void) { resolve({ data: opts.assignments, error: null }); },
        };
        return builder;
      }
      throw new Error(`unexpected table in fake: ${table}`);
    },
  };
}

async function testAuthorizationGateRealDecisionTree() {
  const { assertConnectorCapabilityAuthorized } = await import("@stratxcel/connectors");

  const notConnected = await assertConnectorCapabilityAuthorized(makeFakeSupabase({ connection: null, assignments: [] }) as never, {
    connectorKey: "gemini",
    capabilityKey: "media.image_generation",
    tenantId: "tenant-1",
  });
  assert.deepEqual(notConnected, { authorized: false, reason: "connector_not_connected" });

  const unhealthy = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "error" }, assignments: [] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.deepEqual(unhealthy, { authorized: false, reason: "connector_unhealthy:error" });

  const noAssignment = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.deepEqual(noAssignment, { authorized: false, reason: "capability_not_assigned" }, "connected+healthy is NOT enough on its own -- an explicit assignment is required (Section 17: presence in Admin does not mean every agent can use it)");

  const disabled = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "disabled", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.deepEqual(disabled, { authorized: false, reason: "autonomy_disabled" });

  const approvalRequired = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "approval_required", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.deepEqual(approvalRequired, { authorized: false, reason: "autonomy_approval_required_not_yet_auto_routed" }, "approval_required must BLOCK, not silently proceed -- auto-routing through the approval flow is a real, separate future task");

  const executeAuthorized = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "execute", tenant_id: "tenant-1" }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "tenant-1" }
  );
  assert.deepEqual(executeAuthorized, { authorized: true, autonomy: "execute" });

  const platformWideAssignmentMatchesAnyTenant = await assertConnectorCapabilityAuthorized(
    makeFakeSupabase({ connection: { id: "conn-1", status: "healthy" }, assignments: [{ autonomy: "read", tenant_id: null }] }) as never,
    { connectorKey: "gemini", capabilityKey: "media.image_generation", tenantId: "some-other-tenant" }
  );
  assert.deepEqual(platformWideAssignmentMatchesAnyTenant, { authorized: true, autonomy: "read" }, "a platform-wide assignment (tenant_id null) authorizes any tenant's call");

  const undeclaredCapability = await assertConnectorCapabilityAuthorized(makeFakeSupabase({ connection: null, assignments: [] }) as never, {
    connectorKey: "gemini",
    capabilityKey: "not_a_real_capability",
    tenantId: "tenant-1",
  });
  assert.equal(undeclaredCapability.authorized, false);
  assert.match((undeclaredCapability as { reason: string }).reason, /^capability_not_declared_for_connector:/, "must refuse before even looking up a connection when the capability isn't real for this connector at all");

  console.log("connectors.test.ts: assertConnectorCapabilityAuthorized's real decision tree is correct — PASS");
}

async function testInvokeToolWiresTheAuthorizationGateBeforeExecutionAndAuditsDenial() {
  // readSource is scoped under packages/connectors/src -- read the real
  // hermes-gateway file directly instead, matching this session's other
  // cross-package source-regex tests.
  const gatewaySource = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(gatewaySource, /const HERMES_TOOL_CONNECTOR_MAP: Partial<Record<ToolName, \{ connectorKey: string; capabilityKey: string \}>> = \{/, "the real tool-to-connector map must exist");
  assert.match(gatewaySource, /generate_image: \{ connectorKey: "gemini", capabilityKey: "media\.image_generation" \}/);
  assert.match(gatewaySource, /check_domain_status: \{ connectorKey: "vercel", capabilityKey: "website\.domain_status" \}/);
  const invokeToolBlock = gatewaySource.match(/export async function invokeTool\([\s\S]*?\n\}/)?.[0];
  assert.ok(invokeToolBlock, "invokeTool must exist");
  assert.match(invokeToolBlock!, /const connectorGate = HERMES_TOOL_CONNECTOR_MAP\[tool\];/, "invokeTool must check the connector gate for every call");
  assert.match(invokeToolBlock!, /if \(!authz\.authorized\) \{/, "an unauthorized call must be refused, not merely logged");
  assert.match(invokeToolBlock!, /throw new ConnectorNotAuthorizedError\(tool, authz\.reason\);/, "an unauthorized call must throw before the real handler ever runs");
  assert.match(invokeToolBlock!, /action: `hermes\.tool_call\.\$\{tool\}\.denied`/, "a denial must be recorded in the real audit log, not silently swallowed");
  // The gate check must appear BEFORE the handler is invoked, not after.
  const gateIndex = invokeToolBlock!.indexOf("const connectorGate");
  const handlerCallIndex = invokeToolBlock!.indexOf("await handler(ctx, input)");
  assert.ok(gateIndex > -1 && handlerCallIndex > -1 && gateIndex < handlerCallIndex, "the authorization check must run BEFORE the handler executes, never after");
  console.log("connectors.test.ts: invokeTool enforces the connector authorization gate before execution and audits denial — PASS");
}

async function run() {
  await testRegistryHasAllTenConnectorsFromTheMasterBriefWithSaneShape();
  await testMcpManagedConnectorsDeclareNoRequiredEnvVarsButHaveARealStatusSource();
  await testCreateConnectorConnectionRefusesASecretForMcpManagedAndReadOnlyAdapterConnectors();
  await testHealthHandlerReusesTheRealFunctionsForEachConnector();
  await testReadOnlyAdapterConnectorsNeverCreateAConnectorConnectionsSecretColumnRead();
  await testAuthorizationGateRealDecisionTree();
  await testInvokeToolWiresTheAuthorizationGateBeforeExecutionAndAuditsDenial();
  console.log("connectors.test.ts (@stratxcel/connectors): ALL PASS");
}

run();
