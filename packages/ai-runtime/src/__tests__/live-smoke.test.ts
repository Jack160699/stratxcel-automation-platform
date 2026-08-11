// Opt-in live smoke: AI_LIVE_SMOKE_TEST=1
// Never uses customer data. Never publishes/sends/charges.
import assert from "node:assert/strict";
import { GeminiTextProvider, OpenAITextProvider, resolveModelId } from "../index.ts";

async function run() {
  if (process.env.AI_LIVE_SMOKE_TEST !== "1") {
    console.log("live-smoke.test.ts: NOT_RUN (set AI_LIVE_SMOKE_TEST=1 to enable)");
    return;
  }

  const google = new GeminiTextProvider();
  const openai = new OpenAITextProvider();

  if (google.isConfigured()) {
    const result = await google.complete({
      model: resolveModelId("GOOGLE_CHEAP"),
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      reasoningLevel: "minimal",
      timeoutMs: 30_000,
    });
    assert.ok(result.text.toLowerCase().includes("ok") || result.text.length > 0);
    console.log("LIVE_GEMINI_SMOKE: PASS");
  } else {
    console.log("LIVE_GEMINI_SMOKE: NOT_RUN (GEMINI_API_KEY missing locally)");
  }

  if (openai.isConfigured()) {
    const result = await openai.complete({
      model: resolveModelId("OPENAI_CHEAP_FALLBACK"),
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      reasoningLevel: "none",
      timeoutMs: 30_000,
    });
    assert.ok(result.text.toLowerCase().includes("ok") || result.text.length > 0);
    console.log("LIVE_OPENAI_SMOKE: PASS");
  } else {
    console.log("LIVE_OPENAI_SMOKE: NOT_RUN (OPENAI_API_KEY missing locally)");
  }

  if (process.env.AI_LIVE_IMAGE_SMOKE === "1") {
    console.log("LIVE_IMAGE_SMOKE: skipped by default cost guard — enable separately in ops");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
