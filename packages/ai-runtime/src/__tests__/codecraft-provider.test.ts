// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/codecraft-provider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  AIRuntime,
  CodeCraftTextProvider,
  toCodeCraftMessages,
  AIProviderError,
  type AIMessage,
  type AITextProviderAdapter,
} from "../index.ts";

test("toCodeCraftMessages maps roles accurately", () => {
  const messages: AIMessage[] = [
    { role: "developer", content: "system directive" },
    { role: "user", content: "hello user" },
    { role: "assistant", content: "hello assistant" },
  ];
  const mapped = toCodeCraftMessages(messages);
  assert.equal(mapped.length, 3);
  assert.equal(mapped[0].role, "system");
  assert.equal(mapped[0].content, "system directive");
  assert.equal(mapped[1].role, "user");
  assert.equal(mapped[2].role, "assistant");
});

test("CodeCraftTextProvider handles unconfigured state safely", () => {
  const provider = new CodeCraftTextProvider({ apiKey: "" });
  assert.equal(provider.isConfigured(), false);
  assert.rejects(
    () =>
      provider.complete({
        model: "deepseek-v4-flash-0731",
        messages: [{ role: "user", content: "test" }],
        reasoningLevel: "none",
        timeoutMs: 5000,
      }),
    (err: unknown) => {
      assert(err instanceof AIProviderError);
      assert.equal(err.category, "NOT_CONFIGURED");
      return true;
    }
  );
});

test("CodeCraftTextProvider enforces safety token limit", async () => {
  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        id: "chat-123",
        choices: [{ message: { content: "Sample response" } }],
        usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const provider = new CodeCraftTextProvider({
    apiKey: "test-key",
    tokenLimit: 150,
    fetchImpl: mockFetch as any,
  });

  // Turn 1: consumes 100 tokens (cumulative: 100 <= 150)
  const res1 = await provider.complete({
    model: "deepseek-v4-flash-0731",
    messages: [{ role: "user", content: "hello" }],
    reasoningLevel: "none",
    timeoutMs: 5000,
  });
  assert.equal(res1.text, "Sample response");
  assert.equal(provider.getCumulativeTokens(), 100);

  // Turn 2: consumes 100 tokens (cumulative reaches 200 > 150)
  await provider.complete({
    model: "deepseek-v4-flash-0731",
    messages: [{ role: "user", content: "hello again" }],
    reasoningLevel: "none",
    timeoutMs: 5000,
  });
  assert.equal(provider.getCumulativeTokens(), 200);

  // Turn 3: blocked by token limit
  await assert.rejects(
    () =>
      provider.complete({
        model: "deepseek-v4-flash-0731",
        messages: [{ role: "user", content: "should be blocked" }],
        reasoningLevel: "none",
        timeoutMs: 5000,
      }),
    (err: unknown) => {
      assert(err instanceof AIProviderError);
      assert.equal(err.category, "BUDGET_EXHAUSTED");
      return true;
    }
  );
});

test("AIRuntime provider routing: google and openai remain default, codecraft is optional", () => {
  const dummyAdapter = (name: any): AITextProviderAdapter => ({
    provider: name,
    isConfigured: () => true,
    complete: async () => ({
      text: "ok",
      toolCalls: [],
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      providerRequestId: null,
    }),
    probeReadiness: async () => ({
      configured: true,
      reachable: true,
      modelAvailable: true,
      lastCheckedAt: null,
      safeErrorCode: null,
    }),
  });

  const customGoogle = dummyAdapter("google");
  const customOpenAI = dummyAdapter("openai");
  const customCodeCraft = dummyAdapter("codecraft");

  const runtime = new AIRuntime({
    google: customGoogle,
    openai: customOpenAI,
    codecraft: customCodeCraft,
  });

  // Default provider resolution
  assert.equal(runtime.providerFor("google"), customGoogle);
  assert.equal(runtime.providerFor("openai"), customOpenAI);
  assert.equal(runtime.providerFor("codecraft"), customCodeCraft);
});

test("AIRuntime throws NOT_CONFIGURED when codecraft requested but not provided", () => {
  const prevEnv = process.env.CODECRAFT_API_KEY;
  delete process.env.CODECRAFT_API_KEY;

  try {
    const runtime = new AIRuntime({});
    assert.throws(
      () => runtime.providerFor("codecraft"),
      (err: unknown) => {
        assert(err instanceof AIProviderError);
        assert.equal(err.category, "NOT_CONFIGURED");
        return true;
      }
    );
  } finally {
    if (prevEnv) process.env.CODECRAFT_API_KEY = prevEnv;
  }
});
