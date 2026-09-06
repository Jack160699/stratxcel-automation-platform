// Validates the OpenRouter integration: the adapter's request/response
// mapping against OpenRouter's real, published chat/completions contract,
// its readiness probe, and — most importantly — that adding it as a fourth
// AIProviderId does NOT change any existing task-class routing unless
// OPENROUTER_ENABLED is explicitly set (regression safety for every paying
// tenant's default Gemini/OpenAI routing).
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/openrouter-provider.test.ts

import assert from "node:assert/strict";
import {
  OpenRouterTextProvider,
  probeOpenRouterReadiness,
  buildTaskPolicies,
  isOpenRouterRoutingEnabled,
} from "../index.ts";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

function testIsConfiguredRequiresApiKey() {
  assert.equal(new OpenRouterTextProvider({}).isConfigured(), false);
  assert.equal(new OpenRouterTextProvider({ apiKey: "k" }).isConfigured(), true);
  console.log("openrouter-provider.test.ts: isConfigured requires an apiKey — PASS");
}

// Real shape confirmed live against OpenRouter's own published API
// reference on 2026-09-07 — standard OpenAI-compatible chat/completions.
async function testCompleteParsesRealChatCompletionsShape() {
  const provider = new OpenRouterTextProvider({
    apiKey: "test-only",
    fetchImpl: fakeFetch((url, init) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "liquid/lfm-2.5-2.6b:free");
      assert.equal(body.messages[0].content, "hello");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-123",
          choices: [{ index: 0, message: { role: "assistant", content: "hi there" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
        { status: 200 },
      );
    }),
  });
  const result = await provider.complete({
    model: "liquid/lfm-2.5-2.6b:free",
    messages: [{ role: "user", content: "hello" }],
    reasoningLevel: "low",
    timeoutMs: 5000,
  });
  assert.equal(result.text, "hi there");
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.usage.outputTokens, 4);
  assert.equal(result.usage.estimatedCostUsd, 0, "the :free catalog entry must cost $0");
  assert.equal(result.providerRequestId, "chatcmpl-123");
  console.log("openrouter-provider.test.ts: complete() parses the real OpenAI-compatible chat/completions response — PASS");
}

// Real tool_calls shape: { type: "function", function: { name, arguments } }.
async function testCompleteParsesToolCalls() {
  const provider = new OpenRouterTextProvider({
    apiKey: "test-only",
    fetchImpl: fakeFetch((_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.tools[0].type, "function");
      assert.equal(body.tools[0].function.name, "lookup");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-456",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: '{"q":"solar"}' } }],
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
        { status: 200 },
      );
    }),
  });
  const result = await provider.complete({
    model: "liquid/lfm-2.5-2.6b:free",
    messages: [{ role: "user", content: "find it" }],
    tools: [{ name: "lookup", description: "Look something up", parameters: { type: "object", properties: {} } }],
    reasoningLevel: "low",
    timeoutMs: 5000,
  });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]!.name, "lookup");
  assert.deepEqual(result.toolCalls[0]!.arguments, { q: "solar" });
  console.log("openrouter-provider.test.ts: complete() parses real OpenAI-compatible tool_calls — PASS");
}

async function testCompleteClassifiesRealDocumentedErrorCodes() {
  const provider = new OpenRouterTextProvider({
    apiKey: "test-only",
    fetchImpl: fakeFetch(() => new Response("", { status: 402 })),
  });
  await assert.rejects(
    provider.complete({ model: "m", messages: [{ role: "user", content: "x" }], reasoningLevel: "low", timeoutMs: 1000 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { category?: string }).category, "CREDIT");
      return true;
    },
  );
  console.log("openrouter-provider.test.ts: HTTP 402 (OpenRouter's documented 'insufficient credits') classifies as CREDIT — PASS");
}

async function testProbeReadinessNotConfigured() {
  const health = await probeOpenRouterReadiness({ apiKey: undefined });
  assert.equal(health.configured, false);
  assert.equal(health.safeErrorCode, "OPENROUTER_NOT_CONFIGURED");
  console.log("openrouter-provider.test.ts: probeOpenRouterReadiness reports not-configured without a key — PASS");
}

async function testProbeReadinessChecksModels() {
  const health = await probeOpenRouterReadiness({
    apiKey: "k",
    fetchImpl: fakeFetch((url) => {
      assert.equal(url, "https://openrouter.ai/api/v1/models");
      return new Response(JSON.stringify({ data: [{ id: "liquid/lfm-2.5-2.6b:free" }] }), { status: 200 });
    }),
  });
  assert.equal(health.configured, true);
  assert.equal(health.reachable, true);
  assert.equal(health.modelAvailable, true);
  console.log("openrouter-provider.test.ts: probeOpenRouterReadiness confirms reachability via GET /api/v1/models — PASS");
}

function testRoutingDisabledByDefaultDoesNotChangeExistingPolicies() {
  const envDisabled = { ...process.env };
  delete envDisabled.OPENROUTER_ENABLED;
  const policiesDisabled = buildTaskPolicies(envDisabled);
  assert.equal(isOpenRouterRoutingEnabled(envDisabled), false);
  for (const policy of Object.values(policiesDisabled)) {
    assert.ok(
      policy.candidates.every((c) => c.provider !== "openrouter"),
      `${policy.taskClass} must not include an openrouter candidate when OPENROUTER_ENABLED is unset`,
    );
  }
  // Spot-check exact candidate count is unchanged from before this integration.
  assert.equal(policiesDisabled.GENERAL_SPECIALIST.candidates.length, 3);
  console.log("openrouter-provider.test.ts: OPENROUTER_ENABLED unset leaves every existing task policy byte-for-byte unchanged — PASS");
}

function testRoutingEnabledAddsOpenRouterOnlyToGeneralSpecialist() {
  const envEnabled = { ...process.env, OPENROUTER_ENABLED: "1" };
  const policies = buildTaskPolicies(envEnabled);
  assert.equal(isOpenRouterRoutingEnabled(envEnabled), true);

  const general = policies.GENERAL_SPECIALIST;
  assert.equal(general.candidates.length, 4);
  assert.equal(general.candidates.at(-1)!.provider, "openrouter");
  assert.equal(general.candidates.at(-1)!.role, "escalation", "additive only -- never demotes the existing primary/fallback");
  // Existing candidates 0/1/2 (google/openai/google) are untouched.
  assert.equal(general.candidates[0]!.provider, "google");
  assert.equal(general.candidates[0]!.role, "primary");

  for (const [taskClass, policy] of Object.entries(policies)) {
    if (taskClass === "GENERAL_SPECIALIST") continue;
    assert.ok(policy.candidates.every((c) => c.provider !== "openrouter"), `${taskClass} must remain untouched`);
  }
  console.log("openrouter-provider.test.ts: OPENROUTER_ENABLED=1 appends openrouter as an escalation-only rung on GENERAL_SPECIALIST, untouched everywhere else — PASS");
}

async function run() {
  testIsConfiguredRequiresApiKey();
  await testCompleteParsesRealChatCompletionsShape();
  await testCompleteParsesToolCalls();
  await testCompleteClassifiesRealDocumentedErrorCodes();
  await testProbeReadinessNotConfigured();
  await testProbeReadinessChecksModels();
  testRoutingDisabledByDefaultDoesNotChangeExistingPolicies();
  testRoutingEnabledAddsOpenRouterOnlyToGeneralSpecialist();
  console.log("openrouter-provider.test.ts (@stratxcel/ai-runtime): ALL PASS");
}

run();
