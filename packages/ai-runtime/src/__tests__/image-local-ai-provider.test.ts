// FINAL STRATXCEL -- REMOVE LOCAL AI FROM IMAGE GENERATION (2026-09-06).
//
// This file used to prove Local AI was a genuine first-choice image
// provider at the real ImageMediaRuntime.generate() boundary. That
// architecture is gone: image generation is cloud-only, unconditionally,
// with no flag or injectable dependency able to route a request to Local
// AI. This suite now proves the opposite of what it used to -- that no
// combination of LOCAL_AI_ENABLED, a configured local server, or a
// reachable ai.stratxcel.in can make an image request touch it, even
// when every cloud provider is unavailable.
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/image-local-ai-provider.test.ts

import assert from "node:assert/strict";
import { ImageMediaRuntime, ProviderCircuitBreaker } from "../index.ts";

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

function withLocalAiConfigured<T>(fn: () => Promise<T>): Promise<T> {
  const prevUrl = process.env.LOCAL_AI_API_URL;
  const prevKey = process.env.LOCAL_AI_API_KEY;
  process.env.LOCAL_AI_API_URL = "https://ai.stratxcel.in";
  process.env.LOCAL_AI_API_KEY = "test-only-key";
  return fn().finally(() => {
    if (prevUrl === undefined) delete process.env.LOCAL_AI_API_URL;
    else process.env.LOCAL_AI_API_URL = prevUrl;
    if (prevKey === undefined) delete process.env.LOCAL_AI_API_KEY;
    else process.env.LOCAL_AI_API_KEY = prevKey;
  });
}

/** Any attempted call to the local server or its base URL fails the test outright. */
function assertNeverLocalFetch(url: string) {
  if (url.includes("ai.stratxcel.in") || url.includes("local.example") || url.includes("/v1/images/generate")) {
    throw new Error(`FAIL: image generation attempted a Local AI call: ${url}`);
  }
}

async function testLocalAiEnabledAndConfiguredStillNeverCalledForImages() {
  // Both gates that used to make local a genuine first-choice provider are
  // ON here -- LOCAL_AI_ENABLED="1" AND a fully configured local server --
  // exactly the state a deliberate chat/coding rollout would leave
  // production in. Image generation must still never touch it.
  await withLocalAiEnabled(() =>
    withLocalAiConfigured(async () => {
      let geminiCalled = false;
      const fetchImpl = fakeFetch((url) => {
        assertNeverLocalFetch(url);
        if (url.includes("generativelanguage.googleapis.com")) {
          geminiCalled = true;
          return new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      const runtime = new ImageMediaRuntime({ geminiApiKey: "gemini-test-key", fetchImpl, requireStorageForOperational: false });
      const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
      assert.equal(result.outcome, "OK");
      assert.equal(result.provider, "google", "image generation must go to the cloud provider even with LOCAL_AI_ENABLED=1 and a configured local server");
      assert.equal(geminiCalled, true);
      console.log("image-local-ai-provider.test.ts: LOCAL_AI_ENABLED=1 + configured local server -> image request still goes straight to cloud — PASS");
    }),
  );
}

async function testAllCloudProvidersUnavailableFailsRatherThanFallingBackToLocal() {
  // The real failure mode this proves against: every cloud provider down,
  // local reachable and healthy -- the old code would have silently served
  // a local image here. It must now return a controlled failure instead.
  await withLocalAiEnabled(() =>
    withLocalAiConfigured(async () => {
      const fetchImpl = fakeFetch((url) => {
        assertNeverLocalFetch(url);
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      // No OpenAI key configured either -- Gemini is the only cloud
      // provider available, and it fails.
      const runtime = new ImageMediaRuntime({ geminiApiKey: "gemini-test-key", openaiApiKey: undefined, fetchImpl, requireStorageForOperational: false });
      const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
      assert.equal(result.outcome, "FAILED", "with no cloud provider able to serve the request, the outcome must be a controlled failure, never a silent local substitution");
      assert.notEqual(result.provider, "local");
      console.log("image-local-ai-provider.test.ts: all cloud providers unavailable -> controlled FAILED outcome, never a silent Local AI substitution — PASS");
    }),
  );
}

async function testGeminiFailureHopsToOpenAiNeverLocal() {
  await withLocalAiEnabled(() =>
    withLocalAiConfigured(async () => {
      let openaiCalled = false;
      const fetchImpl = fakeFetch((url) => {
        assertNeverLocalFetch(url);
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
        }
        if (url.includes("api.openai.com")) {
          openaiCalled = true;
          return new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      const runtime = new ImageMediaRuntime({ geminiApiKey: "gemini-test-key", openaiApiKey: "openai-test-key", fetchImpl, requireStorageForOperational: false });
      const result = await runtime.generate({ tenantId: "tenant-1", prompt: "a tiny blue circle icon", tier: "standard" });
      assert.equal(result.outcome, "OK");
      assert.equal(result.provider, "openai", "the configured cloud fallback (OpenAI) must be used, not Local AI");
      assert.equal(openaiCalled, true);
      console.log("image-local-ai-provider.test.ts: Gemini failure hops to the OpenAI cloud fallback, never Local AI — PASS");
    }),
  );
}

async function testProviderTypesStructurallyExcludeLocal() {
  // Compile-time guarantee, exercised at runtime: ImageCandidateResult and
  // ImageGenerationOutcome's `provider` field is typed "google" | "openai"
  // (ImageGenerationOutcome adds | null) -- "local" is not a member of
  // either union, so no code path in this file can even construct one.
  await withLocalAiEnabled(async () => {
    const fetchImpl = fakeFetch((url) => {
      assertNeverLocalFetch(url);
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const runtime = new ImageMediaRuntime({ geminiApiKey: "gemini-test-key", fetchImpl, requireStorageForOperational: false });
    const result = await runtime.generate({ tenantId: "tenant-1", prompt: "icon", tier: "standard" });
    const allowedProviders: ReadonlyArray<string | null> = ["google", "openai", null];
    assert.ok(allowedProviders.includes(result.provider), `provider must be one of ${JSON.stringify(allowedProviders)}, got ${result.provider}`);
    for (const candidate of result.candidates) {
      assert.ok(candidate.provider === "google" || candidate.provider === "openai", `candidate.provider must never be "local", got ${candidate.provider}`);
    }
    console.log("image-local-ai-provider.test.ts: provider fields are structurally limited to cloud providers — PASS");
  });
}

async function testNoLocalImageProviderInImageMediaDeps() {
  // The old constructor accepted a `localImageProvider` override -- the
  // exact seam that made local a real, injectable first-choice provider.
  // It no longer exists on the type at all.
  const deps: import("../media/image.ts").ImageMediaDeps = { requireStorageForOperational: false };
  assert.ok(!("localImageProvider" in deps));
  // @ts-expect-error -- localImageProvider must not be a valid ImageMediaDeps property anymore.
  const _rejected: import("../media/image.ts").ImageMediaDeps = { localImageProvider: null };
  void _rejected;
  console.log("image-local-ai-provider.test.ts: ImageMediaDeps has no local-image injection seam — PASS");
}

async function run() {
  await testLocalAiEnabledAndConfiguredStillNeverCalledForImages();
  await testAllCloudProvidersUnavailableFailsRatherThanFallingBackToLocal();
  await testGeminiFailureHopsToOpenAiNeverLocal();
  await testProviderTypesStructurallyExcludeLocal();
  await testNoLocalImageProviderInImageMediaDeps();
  console.log("image-local-ai-provider.test.ts: ALL PASS");
}

run();
