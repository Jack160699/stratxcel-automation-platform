// Run with: node --experimental-strip-types lib/local-ai/__tests__/connection.test.ts
//
// StratXcel Admin -> Local AI connection interface mission (2026-09-06).
// Focuses on probeLocalAIConnection's real, empirically-derived
// classification logic (network failure vs. Cloudflare tunnel-down vs. a
// real API-level error vs. genuine success) and pairLocalAIConnection's
// error-path parsing of the real, confirmed /v1/pair error shapes -- both
// exercised via an injected fetchImpl, no real network calls. Full
// success-path pairing (which also touches @stratxcel/byok's vault and
// Supabase) is not covered here -- that path was verified live against
// the real server's error shapes during this mission (see
// app/api/internal/ai/diagnostics/route.ts's raw_pair probe) but a
// genuine success response was never observed (no live pairing code was
// available), so this file does not fabricate a fake success round-trip
// through the vault.
import assert from "node:assert/strict";
import { probeLocalAIConnection, pairLocalAIConnection, type FetchLike } from "../connection.ts";

function jsonResponse(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

function htmlResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=UTF-8" } });
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchLike {
  return (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init)) as FetchLike;
}

async function testCloudflareTunnelDownIsNeverConfusedWithAnApiError() {
  // Real, empirically-confirmed shape (2026-09-06): HTTP 530, Cloudflare's
  // own HTML error page, not a StratXcel API response at all.
  const fetchImpl = fakeFetch(() =>
    htmlResponse(530, '<!doctype html><html><head><title>Cloudflare Tunnel error | ai.stratxcel.in | Cloudflare</title></head></html>')
  );
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in", apiKey: "k", fetchImpl });
  assert.equal(result.tunnelReachable, false, "a Cloudflare tunnel-down page must never be read as tunnel-reachable");
  assert.equal(result.apiReachable, false);
  assert.equal(result.status, "DISCONNECTED");
  assert.equal(result.errorCode, "TUNNEL_DOWN");
  console.log("connection.test.ts: Cloudflare tunnel-down page classified as DISCONNECTED/TUNNEL_DOWN — PASS");
}

async function testRealApiErrorIsDistinctFromTunnelDown() {
  // The tunnel IS up here -- a real JSON error came back from the FastAPI
  // app itself (a rejected/expired key), which is a materially different
  // situation from the machine being offline.
  let modelsCalled = false;
  const fetchImpl = fakeFetch((url) => {
    if (url.includes("/v1/models")) {
      modelsCalled = true;
      return jsonResponse(200, { data: [] });
    }
    return jsonResponse(401, { detail: "Invalid API key" });
  });
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in", apiKey: "stale-key", fetchImpl });
  assert.equal(result.tunnelReachable, true, "a real API-level error still means the tunnel itself is up");
  assert.equal(result.apiReachable, false);
  assert.equal(result.status, "DISCONNECTED");
  assert.equal(result.errorCode, "AUTH_REJECTED");
  assert.equal(modelsCalled, false, "models must never be queried once /v1/ready and /v1/health both failed at the API level");
  console.log("connection.test.ts: a real 401 from the API itself is tunnelReachable=true, apiReachable=false, AUTH_REJECTED — PASS");
}

async function testNetworkFailureIsClassifiedSeparately() {
  const fetchImpl = fakeFetch(() => {
    throw new Error("fetch failed: ECONNREFUSED");
  });
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in", apiKey: "k", fetchImpl });
  assert.equal(result.tunnelReachable, false);
  assert.equal(result.apiReachable, false);
  assert.equal(result.status, "DISCONNECTED");
  assert.equal(result.errorCode, "NETWORK_UNREACHABLE");
  console.log("connection.test.ts: a thrown network error is classified NETWORK_UNREACHABLE, not confused with a tunnel-down HTML page — PASS");
}

async function testFullyHealthyConnectionReportsConnectedWithNoResidualError() {
  // Real, empirically-confirmed /v1/models shape (2026-09-06, live against
  // ai.stratxcel.in): { models: [{ name, tier, status: "available" }] } --
  // NOT { data: [{id}] } as first assumed before this shape was confirmed.
  const fetchImpl = fakeFetch((url) => {
    if (url.endsWith("/v1/ready")) return jsonResponse(200, { status: "ready" });
    if (url.endsWith("/v1/models"))
      return jsonResponse(200, {
        models: [
          { name: "sdxl-quality", tier: "image_quality", status: "available" },
          { name: "gemini-2.5-flash", tier: "cloud_fallback", status: "unconfigured" },
        ],
      });
    return jsonResponse(404, { detail: "not found" });
  });
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in/", apiKey: "good-key", fetchImpl });
  assert.equal(result.tunnelReachable, true);
  assert.equal(result.apiReachable, true);
  assert.equal(result.modelAvailable, true, "at least one real 'available' model must be enough, even alongside an unconfigured cloud-fallback entry");
  assert.deepEqual(result.modelStatus.models, ["sdxl-quality", "gemini-2.5-flash"], "the real server's `name` field must be read, not just a generic `id` field");
  assert.equal(result.status, "CONNECTED");
  assert.equal(result.errorCode, null, "a genuinely healthy connection must not carry a stale error code forward");
  assert.equal(result.errorMessage, null);
  console.log("connection.test.ts: a fully healthy machine (real models shape, name+status fields) reports CONNECTED with no residual error — PASS");
}

async function testAllModelsUnconfiguredIsNotReportedAsAvailable() {
  const fetchImpl = fakeFetch((url) => {
    if (url.endsWith("/v1/ready")) return jsonResponse(200, { status: "ready" });
    if (url.endsWith("/v1/models")) return jsonResponse(200, { models: [{ name: "gemini-2.5-flash", status: "unconfigured" }] });
    return jsonResponse(404, {});
  });
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in", apiKey: "k", fetchImpl });
  assert.equal(result.modelAvailable, false, "a non-empty models list where every entry is 'unconfigured' must not be read as a usable model");
  assert.equal(result.status, "ERROR");
  console.log("connection.test.ts: an all-unconfigured models list is modelAvailable=false, not a false-positive CONNECTED — PASS");
}

async function testReachableButNoModelIsErrorNotConnected() {
  const fetchImpl = fakeFetch((url) => {
    if (url.endsWith("/v1/ready")) return jsonResponse(200, { status: "ready" });
    if (url.endsWith("/v1/models")) return jsonResponse(200, { data: [] });
    return jsonResponse(404, {});
  });
  const result = await probeLocalAIConnection({ apiUrl: "https://ai.stratxcel.in", apiKey: "k", fetchImpl });
  assert.equal(result.tunnelReachable, true);
  assert.equal(result.apiReachable, true);
  assert.equal(result.modelAvailable, false);
  assert.equal(result.status, "ERROR", "reachable with zero models loaded must not be reported as the same CONNECTED state as a healthy machine");
  console.log("connection.test.ts: reachable API with no model loaded is ERROR, not CONNECTED — PASS");
}

async function testPairMissingFieldSurfacesTheReal422Shape() {
  // Real, empirically-confirmed shape (2026-09-06): FastAPI's own
  // Pydantic validation error when pairing_code is absent.
  const fetchImpl = fakeFetch(() =>
    jsonResponse(422, { detail: [{ type: "missing", loc: ["body", "pairing_code"], msg: "Field required", input: {} }] })
  );
  const result = await pairLocalAIConnection(
    {} as never,
    { apiUrl: "https://ai.stratxcel.in", pairingCode: "", pairedByUserId: null, fetchImpl }
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "LOCAL_AI_PAIR_HTTP_422");
    assert.match(result.errorMessage, /missing or malformed/i);
  }
  console.log("connection.test.ts: a 422 (missing pairing_code) never reaches the vault/DB and reports a clear error — PASS");
}

async function testPairExpiredCodeSurfacesTheRealServerMessageVerbatim() {
  // Real, empirically-confirmed shape (2026-09-06): the server's own
  // message for any unknown/expired code -- passed through verbatim,
  // never reworded into an invented "invalid vs expired" distinction the
  // server itself does not make.
  const fetchImpl = fakeFetch(() => jsonResponse(400, { detail: "Pairing code has expired. Please generate a new one from the dashboard." }));
  const result = await pairLocalAIConnection(
    {} as never,
    { apiUrl: "https://ai.stratxcel.in", pairingCode: "000000", pairedByUserId: null, fetchImpl }
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "INVALID_OR_EXPIRED_CODE");
    assert.equal(result.errorMessage, "Pairing code has expired. Please generate a new one from the dashboard.");
  }
  console.log("connection.test.ts: the server's real expired-code message is surfaced verbatim, never reworded — PASS");
}

async function testPairSuccessWithUnrecognizedShapeFailsClosedInsteadOfInventingAKey() {
  const fetchImpl = fakeFetch(() => jsonResponse(200, { status: "ok", some_other_field: "unexpected" }));
  const result = await pairLocalAIConnection(
    {} as never,
    { apiUrl: "https://ai.stratxcel.in", pairingCode: "REAL-CODE", pairedByUserId: null, fetchImpl }
  );
  assert.equal(result.ok, false, "a 200 with no recognizable key field must fail closed, never silently 'succeed' with an undefined key");
  if (!result.ok) assert.equal(result.errorCode, "UNEXPECTED_PAIR_RESPONSE_SHAPE");
  console.log("connection.test.ts: a 200 response with no recognizable api-key field fails closed instead of inventing a credential — PASS");
}

async function run() {
  await testCloudflareTunnelDownIsNeverConfusedWithAnApiError();
  await testRealApiErrorIsDistinctFromTunnelDown();
  await testNetworkFailureIsClassifiedSeparately();
  await testFullyHealthyConnectionReportsConnectedWithNoResidualError();
  await testAllModelsUnconfiguredIsNotReportedAsAvailable();
  await testReachableButNoModelIsErrorNotConnected();
  await testPairMissingFieldSurfacesTheReal422Shape();
  await testPairExpiredCodeSurfacesTheRealServerMessageVerbatim();
  await testPairSuccessWithUnrecognizedShapeFailsClosedInsteadOfInventingAKey();
  console.log("connection.test.ts: ALL PASS (tunnel-down vs API-error vs network-failure classification, real /v1/pair error shapes)");
}

run();
