// Run with: node --experimental-strip-types packages/hermes/src/__tests__/http-adapter.test.ts
import assert from "node:assert/strict";
import type { MissionRow } from "@stratxcel/missions";
import type { MissionScopedContext } from "../types.ts";

function fakeMission(): MissionRow {
  return {
    id: "mission-1",
    tenant_id: "tenant-1",
    created_by: null,
    goal_text: "test goal",
    service_key: "social_campaign",
    state: "RUNNING",
    estimated_cost_cents: 1000,
    hermes_profile: "stratxcel-content",
    hermes_run_id: null,
    brand_brain_version: 1,
    version: 1,
    idempotency_key: null,
    actual_cost_cents: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fakeContext(): MissionScopedContext {
  return {
    missionId: "mission-1",
    tenantId: "tenant-1",
    goalText: "test goal",
    serviceKey: "social_campaign",
    hermesProfile: "stratxcel-content",
    brandBrainVersion: 1,
    brandBrain: { business_name: "Test Co" },
    budgetCents: 1000,
    allowedTools: ["get_brand_context", "create_draft_artifact"],
  };
}

type FetchCall = { url: string; init?: RequestInit };

function installFakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  let i = 0;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

async function run() {
  process.env.HERMES_GATEWAY_URL = "http://localhost:8642";
  process.env.HERMES_API_KEY = "test-key";
  process.env.HERMES_RUN_MAX_MS = "5000";
  process.env.STRATXCEL_TOOL_GATEWAY_URL = "http://localhost:8082";

  const { createHermesHttpAdapter } = await import("../http-adapter.ts");

  // --- execute(): create -> one pending poll -> completed ---
  {
    const calls = installFakeFetch([
      { status: 200, body: { run_id: "run-123", status: "queued" } },
      { status: 200, body: { run_id: "run-123", status: "running" } },
      { status: 200, body: { run_id: "run-123", status: "completed", output: "All done." } },
    ]);

    const adapter = createHermesHttpAdapter();
    assert.equal(adapter.mode, "http");

    const result = await adapter.execute(fakeMission(), fakeContext(), "mission-token-abc");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(result.summary, "All done.");
    assert.equal(result.hermesRunId, "run-123");

    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/v1\/runs$/);
    assert.equal(calls[0].init?.method, "POST");
    const authHeader = (calls[0].init?.headers as Record<string, string>)?.Authorization;
    assert.equal(authHeader, "Bearer test-key");
    const sentBody = JSON.parse(String(calls[0].init?.body));
    assert.match(sentBody.input, /test goal/);
    assert.ok(!sentBody.input.includes("test-key"), "the Hermes API key must never appear in the run's prompt");
    assert.match(sentBody.input, /mission-token-abc/, "the mission-scoped tool token must be inlined for the tool-bridge prompt");
    assert.match(calls[1].url, /\/v1\/runs\/run-123$/);
    assert.match(calls[2].url, /\/v1\/runs\/run-123$/);
  }

  // --- execute(): FAILED status maps to FAILED outcome, and the summary is
  // the real `error` field (a "failed" run never sets `output` on the real
  // server — see hermes-agent-client.ts's module comment) ---
  {
    installFakeFetch([{ status: 200, body: { run_id: "run-456", status: "failed", error: "Provider authentication failed: bad key" } }]);
    const adapter = createHermesHttpAdapter();
    const result = await adapter.execute(fakeMission(), fakeContext(), "tok");
    assert.equal(result.outcome, "FAILED");
    assert.equal(result.summary, "Provider authentication failed: bad key", "a failed run's summary must surface the real error, not a generic fallback");
  }

  // --- execute(): the real "waiting_for_approval" string (not the previous
  // guess of "requires_approval"/"awaiting_approval"/etc.) maps to
  // AWAITING_APPROVAL, verified against the live 0.20.0 server's source ---
  {
    installFakeFetch([{ status: 200, body: { run_id: "run-appr", status: "waiting_for_approval" } }]);
    const adapter = createHermesHttpAdapter();
    const result = await adapter.execute(fakeMission(), fakeContext(), "tok");
    assert.equal(result.outcome, "AWAITING_APPROVAL");
  }

  // --- execute(): "cancelled" and the transient "stopping" state both map
  // to PARTIALLY_COMPLETED rather than hanging until timeout ---
  {
    installFakeFetch([{ status: 200, body: { run_id: "run-cancel", status: "cancelled" } }]);
    const adapter = createHermesHttpAdapter();
    const result = await adapter.execute(fakeMission(), fakeContext(), "tok");
    assert.equal(result.outcome, "PARTIALLY_COMPLETED");
  }
  {
    installFakeFetch([{ status: 200, body: { run_id: "run-stopping", status: "stopping" } }]);
    const adapter = createHermesHttpAdapter();
    const result = await adapter.execute(fakeMission(), fakeContext(), "tok");
    assert.equal(result.outcome, "PARTIALLY_COMPLETED");
  }

  // --- execute(): HERMES_DEFAULT_MODEL/HERMES_DEFAULT_PROVIDER, when set,
  // are sent on POST /v1/runs — real evidence (2026-08-10) showed Hermes's
  // own default model/routing can 402 on an account without enough credit
  // for it, so an operator must be able to pin an affordable model without
  // a code change. Unset by default (verified by every earlier case in this
  // file, none of which set these vars and none of which sent the fields). ---
  {
    process.env.HERMES_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
    process.env.HERMES_DEFAULT_PROVIDER = "openrouter";
    const calls = installFakeFetch([{ status: 200, body: { run_id: "run-model", status: "completed", output: "ok" } }]);
    const adapter = createHermesHttpAdapter();
    await adapter.execute(fakeMission(), fakeContext(), "tok");
    const sentBody = JSON.parse(String(calls[0].init?.body));
    assert.equal(sentBody.model, "nvidia/nemotron-3-super-120b-a12b:free");
    assert.equal(sentBody.provider, "openrouter");
    delete process.env.HERMES_DEFAULT_MODEL;
    delete process.env.HERMES_DEFAULT_PROVIDER;
  }

  // --- execute(): unrecognized terminal-looking status keeps polling until timeout ---
  {
    process.env.HERMES_RUN_MAX_MS = "50"; // force a fast timeout for this case
    installFakeFetch([{ status: 200, body: { run_id: "run-789", status: "some_future_status_we_dont_know" } }]);
    const adapter = createHermesHttpAdapter();
    await assert.rejects(() => adapter.execute(fakeMission(), fakeContext(), "tok"), /HermesTimeoutError|did not reach a terminal status/);
    process.env.HERMES_RUN_MAX_MS = "5000";
  }

  // --- cancel(): calls the stop endpoint with the given run id ---
  {
    const calls = installFakeFetch([{ status: 200, body: { status: "stopping" } }]);
    const adapter = createHermesHttpAdapter();
    await adapter.cancel("run-999");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/runs\/run-999\/stop$/);
    assert.equal(calls[0].init?.method, "POST");
  }

  // --- healthCheck(): healthy when both /health and /v1/capabilities are ok ---
  {
    installFakeFetch([
      { status: 200, body: { status: "ok" } },
      { status: 200, body: { capabilities: [] } },
    ]);
    const adapter = createHermesHttpAdapter();
    const health = await adapter.healthCheck();
    assert.equal(health.healthy, true);
    assert.equal(health.mode, "http");
  }

  // --- healthCheck(): unhealthy when liveness fails ---
  {
    installFakeFetch([{ status: 503, body: { status: "down" } }]);
    const adapter = createHermesHttpAdapter();
    const health = await adapter.healthCheck();
    assert.equal(health.healthy, false);
  }

  // --- missing config surfaces a clear error, not a hang ---
  {
    delete process.env.HERMES_GATEWAY_URL;
    const adapter = createHermesHttpAdapter();
    await assert.rejects(() => adapter.execute(fakeMission(), fakeContext(), "tok"), /HERMES_GATEWAY_URL/);
    process.env.HERMES_GATEWAY_URL = "http://localhost:8642";
  }

  console.log("http-adapter.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
