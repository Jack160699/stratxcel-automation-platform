/**
 * Regression suite for a P1 finding investigated during the E2E mission on
 * 2026-08-23: PROVIDER_TIMEOUT_UNKNOWN on image generation was reproducible
 * every time, ~90-94s in, with zero server-side logging anywhere in the
 * pipeline -- no model, no elapsed time, no candidate count -- so the only
 * way to even observe the failure was a live browser reproduction.
 *
 * Root causes fixed here:
 * 1. The per-provider-call timeout defaulted to 90s against a 180s Vercel
 *    maxDuration budget, giving Gemini far less real time than the route
 *    actually allows.
 * 2. Multi-candidate requests were generated one at a time in a sequential
 *    loop, so a 2-candidate request could consume up to 2x the per-call
 *    timeout budget against that same fixed ceiling.
 * 3. Every failure/timeout return path was silent -- no safeAiLog call at
 *    all -- so Vercel logs carried no trace of what actually happened.
 */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { AIProviderError, ImageMediaRuntime } from "../index.ts";

describe("Image generation: timeout budget, parallelism, and log visibility", () => {
  it("raises multiple Gemini candidates concurrently, not sequentially", async () => {
    const callTimes: number[] = [];
    const runtime = new ImageMediaRuntime({
      geminiApiKey: "test",
      openaiApiKey: "test",
      fetchImpl: async () => {
        callTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 60));
        return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } }] });
      },
    });
    const startedAt = Date.now();
    const result = await runtime.generate({ tenantId: "tenant-a", prompt: "brief", candidateCount: 3 });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.outcome, "OK");
    assert.equal(result.candidates.length, 3);
    assert.equal(callTimes.length, 3);
    // All three calls must start within the same short window (concurrent),
    // not staggered ~60ms apart (sequential). A generous 40ms slack covers
    // scheduler jitter while still failing if the old sequential loop
    // returned.
    const spread = Math.max(...callTimes) - Math.min(...callTimes);
    assert.ok(spread < 40, `expected concurrent starts (spread<40ms), got ${spread}ms -- candidates are still being requested sequentially`);
    // Total wall time (including non-fetch overhead: persistence, cost
    // accounting) should stay well under 3 sequential 60ms calls (180ms+).
    // A loose 300ms ceiling still clearly distinguishes parallel from
    // sequential without being sensitive to that unrelated overhead.
    assert.ok(elapsedMs < 300, `expected well under 3x60ms=180ms (parallel), took ${elapsedMs}ms -- looks sequential`);
  });

  it("gives a single Gemini attempt more than the old 90s budget, bounded well under the 180s route ceiling", async () => {
    const runtime = new ImageMediaRuntime({ geminiApiKey: "test", openaiApiKey: "test", fetchImpl: async () => new Response("{}") });
    const timeoutMs = (runtime as unknown as { timeoutMs: number }).timeoutMs;
    assert.ok(timeoutMs > 90_000, `expected more than the old 90s default, got ${timeoutMs}ms`);
    assert.ok(timeoutMs <= 170_000, `must leave headroom under the route's maxDuration=180s, got ${timeoutMs}ms`);
  });

  it("logs the real timeout with model, elapsed time, and budget instead of failing silently", async () => {
    const infoSpy = mock.method(console, "info", () => {});
    try {
      const runtime = new ImageMediaRuntime({
        geminiApiKey: "test",
        openaiApiKey: "test",
        fetchImpl: async () => { throw new AIProviderError("TIMEOUT", "timeout"); },
      });
      const result = await runtime.generate({ tenantId: "tenant-a", prompt: "brief" });
      assert.equal(result.outcome, "FAILED");
      assert.equal(result.reason, "provider_timeout_outcome_unknown");

      const timeoutLog = infoSpy.mock.calls
        .map((c) => c.arguments[1] as string)
        .filter(Boolean)
        .map((s) => JSON.parse(s))
        .find((e) => e.event === "ai_image_provider_timeout");
      assert.ok(timeoutLog, "expected an ai_image_provider_timeout log entry -- this path used to log nothing at all");
      assert.equal(timeoutLog.provider, "google");
      assert.equal(timeoutLog.safeErrorCategory, "TIMEOUT");
      assert.equal(typeof timeoutLog.latencyMs, "number");
      assert.match(timeoutLog.detail, /timeoutBudgetMs=\d+/);
    } finally {
      infoSpy.mock.restore();
    }
  });

  it("logs the OpenAI fallback failure instead of failing silently", async () => {
    const infoSpy = mock.method(console, "info", () => {});
    try {
      const runtime = new ImageMediaRuntime({
        geminiApiKey: "test",
        openaiApiKey: "test",
        fetchImpl: async () => new Response("server error", { status: 500 }),
      });
      const result = await runtime.generate({ tenantId: "tenant-a", prompt: "brief" });
      assert.equal(result.outcome, "FAILED");

      const fallbackLog = infoSpy.mock.calls
        .map((c) => c.arguments[1] as string)
        .filter(Boolean)
        .map((s) => JSON.parse(s))
        .find((e) => e.event === "ai_image_openai_fallback_failed");
      assert.ok(fallbackLog, "expected an ai_image_openai_fallback_failed log entry");
      assert.equal(fallbackLog.provider, "openai");
    } finally {
      infoSpy.mock.restore();
    }
  });
});
