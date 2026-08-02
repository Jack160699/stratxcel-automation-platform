// Tests the OpenAI-compatible provider adapter's endpoint construction.
// Run with: node --experimental-strip-types lib/social/__tests__/provider.test.ts

import assert from "node:assert/strict";
import { resolveOpenAIChatCompletionsUrl, resolveOpenAIModel, listProviders } from "../agent/provider.ts";

function run() {
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const originalApiKey = process.env.OPENAI_API_KEY;

  try {
    // Default endpoint: OPENAI_BASE_URL unset -> official OpenAI API, unchanged behavior.
    delete process.env.OPENAI_BASE_URL;
    assert.equal(resolveOpenAIChatCompletionsUrl(), "https://api.openai.com/v1/chat/completions");

    // Environment overrides cannot redirect requests.
    process.env.OPENAI_BASE_URL = "https://example-compatible.test/v1";
    process.env.OPENAI_AGENT_MODEL = "untrusted-model";
    assert.equal(resolveOpenAIChatCompletionsUrl(), "https://api.openai.com/v1/chat/completions");
    assert.equal(resolveOpenAIModel(), "gpt-4o-mini");

    // Alternate override spellings remain ignored.
    process.env.OPENAI_BASE_URL = "https://example-compatible.test/v1/";
    assert.equal(resolveOpenAIChatCompletionsUrl(), "https://api.openai.com/v1/chat/completions");

    process.env.OPENAI_BASE_URL = "https://example-compatible.test/v1///";
    assert.equal(resolveOpenAIChatCompletionsUrl(), "https://api.openai.com/v1/chat/completions");

    // isConfigured() reports false honestly when OPENAI_API_KEY is missing,
    // regardless of OPENAI_BASE_URL — a custom endpoint never implies a key.
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_BASE_URL = "https://example-compatible.test/v1";
    const openai = listProviders().find((p) => p.name === "openai");
    assert.ok(openai, "openai provider should be registered");
    assert.equal(openai!.isConfigured(), false);

    console.log(
      "provider.test.ts: ALL PASS (fixed official endpoint, ignored overrides, missing OPENAI_API_KEY)"
    );
  } finally {
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
    delete process.env.OPENAI_AGENT_MODEL;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
}

run();
