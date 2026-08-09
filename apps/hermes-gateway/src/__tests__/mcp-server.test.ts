// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/mcp-server.test.ts
//
// Covers the parts of the Section 13 checklist that are genuinely
// unit-testable without a database: transport-secret comparison, mission
// capability signature/expiry/allowlist enforcement, and runtime schema
// validation. The parts that require a live Supabase-backed kill-switch
// table and the real invokeTool() handlers (full tool execution, kill
// switch, audit trail, MCP session/resources/prompts protocol behavior)
// are proven live against the real deployment instead — see the
// verification report's Section 14 evidence — rather than mocked away
// here, per the instruction to reuse real token/invokeTool logic rather
// than mock security out of the test.
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { issueMissionToken } from "@stratxcel/hermes";

process.env.HERMES_GATEWAY_SECRET = "test-only-mission-token-secret";
process.env.NODE_ENV = "test"; // server.ts's own module-scope guard against calling .listen()/recordWorkerHeartbeat() (which needs a real Supabase client) on import
// Dummy-but-well-formed Supabase config so createServiceClient() (called
// lazily, on first tool call) constructs successfully — no real network
// reachability is required for construction, only for the query itself.
// This lets the SDK-path test below distinguish "rejected at the schema
// layer" (no query ever attempted) from "reached the handler, then failed
// on kill-switch/infra" (isKillSwitchActive fails CLOSED on a query error —
// see packages/queue/src/kill-switch.ts) without needing a live database.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";

const { authorizeMcpToolCall, mcpInputSchema, buildMcpServer } = await import("../mcp-server.ts");
const { checkMcpTransportAuth } = await import("../server.ts");

function fakeRequest(headers: Record<string, string | undefined>): http.IncomingMessage {
  return { headers } as unknown as http.IncomingMessage;
}

async function run() {
  // === Layer A: static MCP transport secret ================================

  // 1. No bridge secret configured at all -> always rejected, regardless of what's sent.
  delete process.env.STRATXCEL_MCP_BRIDGE_SECRET;
  assert.equal(checkMcpTransportAuth(fakeRequest({ authorization: "Bearer anything" })), false);

  process.env.STRATXCEL_MCP_BRIDGE_SECRET = "real-bridge-secret-value";

  // no header at all
  assert.equal(checkMcpTransportAuth(fakeRequest({})), false);
  // 2. Invalid bridge secret -> rejected
  assert.equal(checkMcpTransportAuth(fakeRequest({ authorization: "Bearer wrong-secret" })), false);
  // wrong scheme
  assert.equal(checkMcpTransportAuth(fakeRequest({ authorization: "Basic real-bridge-secret-value" })), false);
  // 3. Valid bridge secret -> accepted
  assert.equal(checkMcpTransportAuth(fakeRequest({ authorization: "Bearer real-bridge-secret-value" })), true);

  console.log("Layer A (static MCP transport secret): PASS");

  // === Layer B: mission capability token + allowlist ========================

  const allowedOnlyBrandContext = issueMissionToken({
    missionId: "mission-1",
    tenantId: "tenant-1",
    allowedTools: ["get_brand_context"],
  });

  // 4. No mission token field at all -> denied
  {
    const result = authorizeMcpToolCall("get_brand_context", {});
    assert.equal(result.ok, false);
  }

  // 5. Malformed mission token -> denied
  {
    const result = authorizeMcpToolCall("get_brand_context", { missionCapability: "not-a-real-token" });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /malformed/i);
  }

  // 6. Invalid signature -> denied (tamper with a real token's payload segment)
  {
    const [payload] = allowedOnlyBrandContext.split(".");
    const tampered = `${payload}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`;
    const result = authorizeMcpToolCall("get_brand_context", { missionCapability: tampered });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /invalid_signature/i);
  }

  // 7. Expired mission token -> denied
  {
    const expired = issueMissionToken({
      missionId: "mission-1",
      tenantId: "tenant-1",
      allowedTools: ["get_brand_context"],
      ttlMs: -1000, // already expired the instant it was issued
    });
    const result = authorizeMcpToolCall("get_brand_context", { missionCapability: expired });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /expired/i);
  }

  // 8. Tool not in allowedTools -> denied, using a token that allows
  // exactly ONE read-only tool (get_brand_context) — attempting a
  // completely different, non-read-only tool must fail.
  {
    const result = authorizeMcpToolCall("create_crm_lead", { missionCapability: allowedOnlyBrandContext, contactName: "Someone" });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /not in this mission's allowed tool set/);
  }

  // 9 & 10. Controlled tools are absent from the callable set entirely —
  // not merely denied by allowedTools, but not a registerable tool at all.
  {
    const schemas = (await import("@stratxcel/hermes")).TOOL_INPUT_SCHEMAS as Record<string, unknown>;
    assert.ok(!("submit_publish_request" in schemas), "submit_publish_request must never be MCP-callable");
    assert.ok(!("create_website_change_request" in schemas), "create_website_change_request must never be MCP-callable");
  }
  // Even if somehow invoked with a token that (incorrectly) claimed it in
  // allowedTools, authorizeMcpToolCall's own independent check still blocks it.
  {
    // ToolName's type includes submit_publish_request (it's a real tool
    // name, just a business-logic-excluded one) — nothing stops a token
    // payload from naming it in allowedTools, which is exactly why
    // authorizeMcpToolCall's STRATXCEL_CONTROLLED_TOOLS check has to be
    // independent of the token's own claims, not just of registration.
    const tokenClaimingControlledTool = issueMissionToken({
      missionId: "mission-1",
      tenantId: "tenant-1",
      allowedTools: ["submit_publish_request"],
    });
    const result = authorizeMcpToolCall("submit_publish_request" as never, { missionCapability: tokenClaimingControlledTool });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /StratExcel-controlled/);
  }

  // 11 & 12. tenantId/missionId in the call arguments can never override the
  // signed token's identity — authorizeMcpToolCall only ever reads them
  // from the verified payload, never from rawArgs, so injecting them here
  // must have zero effect on the returned identity.
  {
    const result = authorizeMcpToolCall("get_brand_context", {
      missionCapability: allowedOnlyBrandContext,
      tenantId: "attacker-tenant",
      missionId: "attacker-mission",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tenantId, "tenant-1", "tenantId must come only from the verified token");
      assert.equal(result.missionId, "mission-1", "missionId must come only from the verified token");
      assert.ok(!("tenantId" in result.businessArgs), "an injected tenantId must not even survive into businessArgs");
      assert.ok(!("missionId" in result.businessArgs), "an injected missionId must not even survive into businessArgs");
    }
  }

  // 14. Correct allowed tool authorizes cleanly, with the capability
  // stripped out of what would be passed to invokeTool().
  {
    const tokenWithCrm = issueMissionToken({ missionId: "mission-2", tenantId: "tenant-2", allowedTools: ["create_crm_lead"] });
    const result = authorizeMcpToolCall("create_crm_lead", { missionCapability: tokenWithCrm, contactName: "Jane" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.businessArgs, { contactName: "Jane" });
      assert.equal(result.tenantId, "tenant-2");
      assert.equal(result.missionId, "mission-2");
    }
  }

  console.log("Layer B (mission capability enforcement): PASS");

  // === Runtime schema validation (Section 5) ================================

  // 13. Malformed tool args rejected — wrong type
  {
    const schema = mcpInputSchema("create_crm_lead");
    const parsed = schema.safeParse({ missionCapability: "x", contactEmail: 12345 });
    assert.equal(parsed.success, false);
  }
  // missing required property
  {
    const schema = mcpInputSchema("create_draft_artifact");
    const parsed = schema.safeParse({ missionCapability: "x", storageRef: "s3://x" }); // missing required `kind`
    assert.equal(parsed.success, false);
  }
  // array instead of object
  {
    const schema = mcpInputSchema("get_brand_context");
    const parsed = schema.safeParse(["not", "an", "object"]);
    assert.equal(parsed.success, false);
  }
  // unexpected nested/extra shape — including an attempted tenantId/missionId injection at the schema layer itself
  {
    const schema = mcpInputSchema("get_brand_context");
    const parsed = schema.safeParse({ missionCapability: "x", tenantId: "attacker", extra: { nested: "shape" } });
    assert.equal(parsed.success, false, "strict schemas must reject any field beyond missionCapability + the tool's own business fields");
  }
  // missing the capability field entirely
  {
    const schema = mcpInputSchema("get_service_definition");
    const parsed = schema.safeParse({});
    assert.equal(parsed.success, false);
  }
  // valid shape passes
  {
    const schema = mcpInputSchema("attach_research_evidence");
    const parsed = schema.safeParse({ missionCapability: "x", artifactId: "a1", summary: "found a source" });
    assert.equal(parsed.success, true);
  }

  console.log("Runtime schema validation: PASS");

  // === Real MCP server/SDK path (Section: post-activation cleanup) ==========
  //
  // Everything above exercises authorizeMcpToolCall() and mcpInputSchema()
  // directly — neither goes through McpServer.registerTool()'s actual
  // request-handling pipeline, which is exactly where the live 2026-08-09
  // defect lived (registerTool was given `schema.shape`, not `schema`,
  // silently losing `.strict()`). This section builds the real McpServer
  // via the real buildMcpServer() and drives it with a genuine MCP Client
  // over an in-process transport pair (@modelcontextprotocol/sdk's own
  // InMemoryTransport) — the same request/response machinery Hermes uses
  // over the network, minus only the HTTP framing itself.
  {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = buildMcpServer();
    await server.connect(serverTransport);

    const client = new Client({ name: "regression-test-client", version: "0" });
    await client.connect(clientTransport);

    const tokenForInjectionTest = issueMissionToken({
      missionId: "mission-real-path",
      tenantId: "tenant-real-path",
      allowedTools: ["get_brand_context"],
    });

    // 15. THE regression case: valid capability + an injected tenantId/
    // missionId must be rejected by real schema validation, through the
    // real SDK path, before invokeTool() (and therefore before
    // authorizeMcpToolCall() even runs) — not merely ignored downstream.
    {
      const result = await client.callTool({
        name: "get_brand_context",
        arguments: {
          missionCapability: tokenForInjectionTest,
          tenantId: "attacker-tenant",
          missionId: "attacker-mission",
        },
      });
      assert.equal(result.isError, true, "a call with injected tenantId/missionId must be rejected, not silently accepted");
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      // The SDK reports its own schema/argument validation failures this
      // way (confirmed live: "MCP error -32602: Input validation error:
      // Invalid arguments for tool ..."), distinct from this codebase's own
      // application-level error strings (e.g. "kill switch active",
      // "Mission capability rejected") — asserting on this distinguishes a
      // genuine schema-layer rejection from a downstream one.
      assert.match(text, /invalid arguments|unrecognized|input validation/i, `expected a schema-validation rejection, got: ${text}`);
      assert.doesNotMatch(text, /kill switch|mission capability rejected/i, `must be rejected BEFORE reaching the handler, got: ${text}`);
    }

    // 16. The same schema must still accept a clean, legitimate call with no
    // extra fields — proving the fix didn't make the schema layer reject
    // valid input outright. No live database is available in this test, so
    // "still works" is verified as "reaches the real handler and fails only
    // on kill-switch/infra (which itself fails closed on a query error),
    // never on schema/argument validation" — a clear, honest signal that
    // the request passed schema validation.
    {
      const result = await client.callTool({
        name: "get_brand_context",
        arguments: { missionCapability: tokenForInjectionTest },
      });
      assert.equal(result.isError, true, "expected a failure in this DB-less test environment, but not a schema failure");
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      assert.match(text, /kill switch/i, `a clean, valid call must reach the real handler (kill-switch check), got: ${text}`);
      assert.doesNotMatch(text, /invalid arguments|unrecognized|input validation/i, `a clean, valid call must not fail schema validation, got: ${text}`);
    }

    await client.close();
    await server.close();
  }

  console.log("Real MCP server/SDK path (schema.shape -> schema fix): PASS");

  console.log("mcp-server.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
