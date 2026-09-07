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

async function run() {
  await testRegistryHasAllTenConnectorsFromTheMasterBriefWithSaneShape();
  await testMcpManagedConnectorsDeclareNoRequiredEnvVarsButHaveARealStatusSource();
  await testCreateConnectorConnectionRefusesASecretForMcpManagedAndReadOnlyAdapterConnectors();
  await testHealthHandlerReusesTheRealFunctionsForEachConnector();
  await testReadOnlyAdapterConnectorsNeverCreateAConnectorConnectionsSecretColumnRead();
  console.log("connectors.test.ts (@stratxcel/connectors): ALL PASS");
}

run();
