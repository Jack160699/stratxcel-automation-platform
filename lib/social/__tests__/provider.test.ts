import assert from "node:assert/strict";
import { listProviders, resolveEffectiveProviderIdentity } from "../agent/provider.ts";
import { GEMINI_GENERATE_CONTENT_URL, GEMINI_MODEL } from "../agent/gemini-boundary.ts";

function run() {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  try {
    assert.equal(GEMINI_MODEL, "gemini-2.5-flash-lite");
    assert.equal(GEMINI_GENERATE_CONTENT_URL, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent");
    assert.deepEqual(listProviders().map((provider) => provider.name), ["gemini"]);
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "legacy-key-must-not-configure-provider";
    assert.equal(listProviders()[0].isConfigured(), false);
    assert.equal(resolveEffectiveProviderIdentity().configured, false);
    process.env.GEMINI_API_KEY = "test-only";
    assert.deepEqual(resolveEffectiveProviderIdentity(), { provider: "Google Gemini", protocol: "Gemini Developer API", model: "gemini-2.5-flash-lite", configured: true });
    console.log("provider.test.ts: ALL PASS (fixed Gemini endpoint/model, no legacy fallback)");
  } finally {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
}

run();
