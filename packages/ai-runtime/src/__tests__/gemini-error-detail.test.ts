// Found live running the Social Autopilot real-generation quality
// campaign: GeminiTextProvider.complete() threw the bare message
// "Gemini HTTP 429" for BOTH a genuine per-day quota exhaustion and a
// short-lived burst throttle -- identical AIErrorCategory ("RATE_LIMIT")
// for two situations that call for completely different handling (retry
// in seconds vs. stop entirely until the day rolls over). This tests the
// fix: extractGeminiErrorDetail surfaces the real distinguishing detail
// from the provider's own error body.
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/gemini-error-detail.test.ts

import assert from "node:assert/strict";
import { GeminiTextProvider, extractGeminiErrorDetail } from "../index.ts";

// The REAL response body captured live from generativelanguage.googleapis.com
// during the campaign (API key redacted at capture time -- never contained
// a secret to begin with, this is the provider's own JSON error body).
const REAL_DAILY_QUOTA_EXHAUSTED_BODY = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash\nPlease retry in 14.993420193s.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            quotaDimensions: { location: "global", model: "gemini-3.6-flash" },
            quotaValue: "20",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "14s" },
    ],
  },
});

const BURST_RATE_LIMIT_BODY = JSON.stringify({
  error: { code: 429, message: "Resource has been exhausted (e.g. check quota).", status: "RESOURCE_EXHAUSTED" },
});

function testExtractsDailyQuotaIdFromRealCapturedBody() {
  const detail = extractGeminiErrorDetail(REAL_DAILY_QUOTA_EXHAUSTED_BODY);
  assert.ok(detail);
  assert.ok(detail!.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), "must surface the actual per-day quotaId, the one detail that distinguishes this from a burst throttle");
  console.log("gemini-error-detail.test.ts: extracts the real per-day quotaId from a genuine captured quota-exhaustion body — PASS");
}

function testBurstLimitBodyHasNoQuotaId() {
  const detail = extractGeminiErrorDetail(BURST_RATE_LIMIT_BODY);
  assert.ok(detail);
  assert.ok(!detail!.includes("quotaId="), "a burst throttle body has no quotaId -- must not be confused with a per-day exhaustion");
  console.log("gemini-error-detail.test.ts: a burst-style body is distinguishable (no quotaId) from the real daily-quota body — PASS");
}

function testNeverThrowsOnMalformedBody() {
  for (const bad of ["", "not json", "{broken", "null", "<html>502</html>"]) {
    assert.doesNotThrow(() => extractGeminiErrorDetail(bad));
  }
  console.log("gemini-error-detail.test.ts: never throws on a malformed/non-JSON error body — PASS");
}

function testFallsBackToRawTextWhenNotJson() {
  const detail = extractGeminiErrorDetail("Bad Gateway");
  assert.equal(detail, "Bad Gateway");
  console.log("gemini-error-detail.test.ts: falls back to the raw body text when it isn't JSON at all — PASS");
}

async function testProviderSurfacesTheDetailInItsThrownError() {
  const provider = new GeminiTextProvider({
    apiKey: "test-only",
    fetchImpl: (async () => new Response(REAL_DAILY_QUOTA_EXHAUSTED_BODY, { status: 429 })) as typeof fetch,
  });
  await assert.rejects(
    () => provider.complete({ model: "gemini-3.6-flash", messages: [{ role: "user", content: "hi" }], reasoningLevel: "low", timeoutMs: 5000 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), `expected the quotaId in the thrown error message, got: ${err.message}`);
      return true;
    }
  );
  console.log("gemini-error-detail.test.ts: GeminiTextProvider.complete() now throws an error a caller can actually act on — PASS");
}

async function run() {
  testExtractsDailyQuotaIdFromRealCapturedBody();
  testBurstLimitBodyHasNoQuotaId();
  testNeverThrowsOnMalformedBody();
  testFallsBackToRawTextWhenNotJson();
  await testProviderSurfacesTheDetailInItsThrownError();
  console.log("gemini-error-detail.test.ts: ALL PASS");
}

run();
