// Validates Local AI as a genuine (not decorative, not last-resort) provider
// at the real ImageMediaRuntime.generate() boundary — the same class both
// real Social Autopilot production paths call directly (confirmed via
// repository trace). Mocks reproduce the real response shapes confirmed
// live against ai.stratxcel.in on 2026-09-05.
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/image-local-ai-provider.test.ts

import assert from "node:assert/strict";
import { ImageMediaRuntime, LocalAIImageProvider, ProviderCircuitBreaker } from "../index.ts";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

function withLocalAiEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.LOCAL_AI_ENABLED;
  process.env.LOCAL_AI_ENABLED = "1";
  return fn().finally(() => {
    if (prev === undefined) delete process.env.LOCAL_AI_ENABLED;
    else process.env.LOCAL_AI_ENABLED = prev;
  });
}

async function testLocalSucceedsAndCloudNeverTouched() {
  await withLocalAiEnabled(async () => {
    let cloudCalled = false;
    const localFetch = fakeFetch((url) => {
      if (url.includes("generativelanguage.googleapis.com") || url.includes("api.openai.com")) {
        cloudCalled = true;
        throw new Error("cloud must never be called when local succeeds and passes quality gate");
      }
      if (url.endsWith("/v1/images/generate")) {
        return new Response(
          JSON.stringify({
            status: "success",
            image_id: "img_test_1",
            url: "/v1/images/output/img_test_1_fast.png",
            model_tier: "fast",
            provider: "local",
            quality_score: 0.81,
            quality_gate_passed: true,
            candidates_evaluated: 3,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/images/output/")) {
        return new Response(Buffer.from(TINY_PNG_B64, "base64"), { status: 200, headers: { "content-type": "image/png" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const runtime = new ImageMediaRuntime({
      geminiApiKey: "unused-should-not-be-called",
      openaiApiKey: "unused-should-not-be-called",
      fetchImpl: localFetch,
      localImageProvider: new LocalAIImageProvider({ apiUrl: "https://local.example", apiKey: "test-only", fetchImpl: localFetch }),
      requireStorageForOperational: false,
    });

    const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "fast" });
    assert.equal(result.outcome, "OK");
    assert.equal(result.provider, "local");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]!.qualityGatePassed, true);
    assert.equal(cloudCalled, false);
    // Image Quality + Marketing Creative Certification mission (2026-09-06):
    // real, severe defect found live and root-caused -- the remote
    // server's own real id ("img_test_1" here, "img_53605480c9" live) is
    // NOT a UUID, but this candidate's `id` used to BE that raw string,
    // and lib/image-generation/service.ts inserts it straight into
    // image_generation_candidates.id (a `uuid` column) -- every single
    // real Local AI candidate insert failed with a Postgres
    // "invalid input syntax for type uuid" error (CANDIDATE_PERSIST_FAILED),
    // confirmed live: 3/3 real automated Local AI jobs for a fresh tenant
    // failed with exactly that code this pass. `id` must always be a real
    // UUID; the server's own id is preserved separately.
    assert.match(result.candidates[0]!.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "candidate.id must always be a real UUID, never the remote server's own non-UUID image_id -- see this test's comment for the real Postgres failure this caused");
    assert.equal(result.candidates[0]!.providerOutputId, "img_test_1", "the remote server's own real id must still be preserved, just in a separate field the DB's text provider_output_id column actually accepts");
    console.log("image-local-ai-provider.test.ts: local succeeds + passes quality gate -> Gemini/OpenAI never touched — PASS");
  });
}

async function testLocalQualityGateFailureFallsThroughToCloud() {
  await withLocalAiEnabled(async () => {
    let geminiCalled = false;
    const mixedFetch = fakeFetch((url) => {
      if (url.endsWith("/v1/images/generate")) {
        return new Response(
          JSON.stringify({
            status: "success",
            image_id: "img_test_2",
            url: "/v1/images/output/img_test_2_quality.png",
            model_tier: "quality",
            provider: "local",
            quality_score: 0.41,
            quality_gate_passed: false,
            candidates_evaluated: 3,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/images/output/")) {
        return new Response(Buffer.from(TINY_PNG_B64, "base64"), { status: 200, headers: { "content-type": "image/png" } });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalled = true;
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const runtime = new ImageMediaRuntime({
      geminiApiKey: "gemini-test-key",
      openaiApiKey: undefined,
      fetchImpl: mixedFetch,
      localImageProvider: new LocalAIImageProvider({ apiUrl: "https://local.example", apiKey: "test-only", fetchImpl: mixedFetch }),
      requireStorageForOperational: false,
    });

    const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
    assert.equal(geminiCalled, true, "must fall through to Gemini when local's own quality gate rejects every candidate");
    assert.equal(result.outcome, "OK");
    assert.equal(result.provider, "google");
    console.log("image-local-ai-provider.test.ts: local quality-gate failure with cloud configured falls through to Gemini — PASS");
  });
}

async function testLocalQualityGateFailureKeptWhenNoCloudConfigured() {
  await withLocalAiEnabled(async () => {
    const localOnlyFetch = fakeFetch((url) => {
      if (url.endsWith("/v1/images/generate")) {
        return new Response(
          JSON.stringify({
            status: "success",
            image_id: "img_test_3",
            url: "/v1/images/output/img_test_3_quality.png",
            model_tier: "quality",
            provider: "local",
            quality_score: 0.41,
            quality_gate_passed: false,
            candidates_evaluated: 3,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/images/output/")) {
        return new Response(Buffer.from(TINY_PNG_B64, "base64"), { status: 200, headers: { "content-type": "image/png" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const runtime = new ImageMediaRuntime({
      geminiApiKey: undefined,
      openaiApiKey: undefined,
      fetchImpl: localOnlyFetch,
      localImageProvider: new LocalAIImageProvider({ apiUrl: "https://local.example", apiKey: "test-only", fetchImpl: localOnlyFetch }),
      requireStorageForOperational: false,
    });

    const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
    // No cloud provider configured at all -- a quality-gate-failed local image beats nothing.
    assert.equal(result.outcome, "OK");
    assert.equal(result.provider, "local");
    assert.equal(result.reason, "local_quality_gate_failed_no_cloud_fallback_configured");
    console.log("image-local-ai-provider.test.ts: quality-gate-failed local result is still returned when no cloud is configured — PASS");
  });
}

async function testDisabledByDefaultLeavesExistingGeminiBehaviorUnchanged() {
  const prev = process.env.LOCAL_AI_ENABLED;
  delete process.env.LOCAL_AI_ENABLED;
  try {
    let localCalled = false;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("ai.stratxcel.in") || url.includes("local.example")) {
        localCalled = true;
        throw new Error("local must never be attempted when LOCAL_AI_ENABLED is unset");
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const runtime = new ImageMediaRuntime({
      geminiApiKey: "gemini-test-key",
      fetchImpl,
      requireStorageForOperational: false,
    });
    const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
    assert.equal(localCalled, false);
    assert.equal(result.provider, "google");
    console.log("image-local-ai-provider.test.ts: LOCAL_AI_ENABLED unset -> local never attempted, Gemini behavior unchanged — PASS");
  } finally {
    if (prev === undefined) delete process.env.LOCAL_AI_ENABLED;
    else process.env.LOCAL_AI_ENABLED = prev;
  }
}

async function testReferenceImagesSkipLocalEntirely() {
  await withLocalAiEnabled(async () => {
    let localCalled = false;
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith("/v1/images/generate")) {
        localCalled = true;
        throw new Error("local has no confirmed reference/multipart support -- must be skipped, not called");
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const runtime = new ImageMediaRuntime({
      geminiApiKey: "gemini-test-key",
      fetchImpl,
      localImageProvider: new LocalAIImageProvider({ apiUrl: "https://local.example", apiKey: "test-only", fetchImpl }),
      requireStorageForOperational: false,
    });
    const result = await runtime.generate({
      tenantId: "tenant-1",
      prompt: "a tiny blue circle icon",
      tier: "standard",
      referenceImages: [{ mimeType: "image/png", data: TINY_PNG_B64 }],
    });
    assert.equal(localCalled, false);
    assert.equal(result.provider, "google");
    console.log("image-local-ai-provider.test.ts: requests with reference images skip local entirely — PASS");
  });
}

async function testCircuitBreakerSkipsLocalAfterRepeatedFailures() {
  await withLocalAiEnabled(async () => {
    let localAttempts = 0;
    let geminiCalls = 0;
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith("/v1/images/generate")) {
        localAttempts += 1;
        return new Response(JSON.stringify({ detail: "internal error" }), { status: 500 });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const circuit = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    const localProvider = new LocalAIImageProvider({ apiUrl: "https://local.example", apiKey: "test-only", fetchImpl });
    const makeRuntime = () =>
      new ImageMediaRuntime({ geminiApiKey: "gemini-test-key", fetchImpl, localImageProvider: localProvider, circuitBreaker: circuit, requireStorageForOperational: false });

    for (let i = 0; i < 3; i++) {
      await makeRuntime().generate({ tenantId: "tenant-1", prompt: "icon", tier: "standard" });
    }
    assert.equal(localAttempts, 2, "circuit should open after 2 failures and skip the 3rd attempt entirely");
    assert.equal(geminiCalls, 3, "Gemini must still serve every request regardless of local's circuit state");
    console.log("image-local-ai-provider.test.ts: circuit breaker stops hammering a failing local server after threshold — PASS");
  });
}

async function run() {
  await testLocalSucceedsAndCloudNeverTouched();
  await testLocalQualityGateFailureFallsThroughToCloud();
  await testLocalQualityGateFailureKeptWhenNoCloudConfigured();
  await testDisabledByDefaultLeavesExistingGeminiBehaviorUnchanged();
  await testReferenceImagesSkipLocalEntirely();
  await testCircuitBreakerSkipsLocalAfterRepeatedFailures();
  console.log("image-local-ai-provider.test.ts: ALL PASS");
}

run();
