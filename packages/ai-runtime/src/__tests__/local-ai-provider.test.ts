// Validates the remote local AI server integration added alongside
// Gemini/OpenAI: the adapter's request/response mapping, its readiness
// probe, and — most importantly — that adding it as a third AIProviderId
// does NOT change any existing task-class routing unless LOCAL_AI_ENABLED
// is explicitly set (regression safety for every paying tenant's default
// Gemini/OpenAI routing).
// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/local-ai-provider.test.ts

import assert from "node:assert/strict";
import { LocalAITextProvider, LOCAL_AI_CODING_MODEL_SENTINEL, probeLocalAIReadiness, buildTaskPolicies, isLocalAiRoutingEnabled, AIRuntime, InMemoryUsageRecorder } from "../index.ts";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

async function testIsConfiguredRequiresBothUrlAndKey() {
  assert.equal(new LocalAITextProvider({}).isConfigured(), false);
  assert.equal(new LocalAITextProvider({ apiUrl: "https://x.example" }).isConfigured(), false);
  assert.equal(new LocalAITextProvider({ apiKey: "k" }).isConfigured(), false);
  assert.equal(new LocalAITextProvider({ apiUrl: "https://x.example", apiKey: "k" }).isConfigured(), true);
  console.log("local-ai-provider.test.ts: isConfigured requires both apiUrl and apiKey — PASS");
}

// Real shape confirmed live against ai.stratxcel.in on 2026-09-05 — this is
// NOT OpenAI-compatible (no `choices[]`), see providers/local-ai.ts's header comment.
async function testCompleteParsesRealChatResponseShape() {
  const provider = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch((url, init) => {
      assert.equal(url, "https://local.example/v1/chat");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.messages[0].content, "hello");
      assert.equal(body.model, undefined, "this server takes no model field on /v1/chat");
      return new Response(
        JSON.stringify({
          status: "success",
          provider: "local",
          model: "qwen2.5:7b",
          content: "Server online, functioning properly.",
          prompt_tokens: 45,
          completion_tokens: 7,
          total_tokens: 52,
          tokens_per_second: 45.35,
          latency_ms: 10379.31,
          fallback: false,
          fallback_reason: null,
        }),
        { status: 200 },
      );
    }),
  });
  const result = await provider.complete({
    model: "auto",
    messages: [{ role: "user", content: "hello" }],
    reasoningLevel: "low",
    timeoutMs: 5000,
  });
  assert.equal(result.text, "Server online, functioning properly.");
  assert.equal(result.usage.inputTokens, 45);
  assert.equal(result.usage.outputTokens, 7);
  assert.equal(result.providerRequestId, "local:qwen2.5:7b");
  console.log("local-ai-provider.test.ts: complete() parses the real (non-OpenAI-shaped) /v1/chat response — PASS");
}

// Coding is a genuinely separate endpoint on this server — confirmed live.
async function testCompleteDispatchesCodingModelToCodeEndpoint() {
  const provider = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch((url, init) => {
      assert.equal(url, "https://local.example/v1/code");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.prompt, "system instructions\n\nwrite a component");
      assert.equal(body.messages, undefined, "/v1/code takes prompt, not messages");
      return new Response(
        JSON.stringify({
          status: "success",
          provider: "local",
          model: "qwen2.5:7b",
          generated_code: "const Greeting = () => <h1>Hello</h1>;",
          patch: null,
          diff_stat: null,
          target_file: null,
          latency_ms: 11703.8,
        }),
        { status: 200 },
      );
    }),
  });
  const result = await provider.complete({
    model: LOCAL_AI_CODING_MODEL_SENTINEL,
    messages: [
      { role: "system", content: "system instructions" },
      { role: "user", content: "write a component" },
    ],
    reasoningLevel: "medium",
    timeoutMs: 60_000,
  });
  assert.equal(result.text, "const Greeting = () => <h1>Hello</h1>;");
  console.log("local-ai-provider.test.ts: complete() dispatches the coding sentinel model to POST /v1/code — PASS");
}

async function testCompleteClassifiesHttpErrors() {
  const provider = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch(() => new Response("rate limited", { status: 429 })),
  });
  await assert.rejects(
    () => provider.complete({ model: "auto", messages: [{ role: "user", content: "hi" }], reasoningLevel: "low", timeoutMs: 5000 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { category?: string }).category, "RATE_LIMIT");
      return true;
    },
  );
  console.log("local-ai-provider.test.ts: complete() classifies HTTP 429 as RATE_LIMIT — PASS");
}

// FastAPI/Pydantic 422 error bodies are a `detail` array, not a plain string —
// confirmed live (e.g. redeeming a request with a missing required field).
async function testCompleteSurfacesFastApiValidationErrorDetail() {
  const provider = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch(
      () =>
        new Response(
          JSON.stringify({ detail: [{ loc: ["body", "prompt"], msg: "Field required" }] }),
          { status: 422 },
        ),
    ),
  });
  await assert.rejects(
    () => provider.complete({ model: LOCAL_AI_CODING_MODEL_SENTINEL, messages: [{ role: "user", content: "hi" }], reasoningLevel: "low", timeoutMs: 5000 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("body.prompt: Field required"), `expected the real field error in the message, got: ${err.message}`);
      return true;
    },
  );
  console.log("local-ai-provider.test.ts: complete() surfaces the real FastAPI validation detail, not a generic 422 — PASS");
}

async function testProbeReadinessChecksReadyAndModels() {
  const calls: string[] = [];
  const probe = await probeLocalAIReadiness({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    model: "auto",
    fetchImpl: fakeFetch((url) => {
      calls.push(url);
      if (url.endsWith("/v1/ready")) return new Response("ok", { status: 200 });
      if (url.endsWith("/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "auto" }] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  });
  assert.equal(probe.configured, true);
  assert.equal(probe.reachable, true);
  assert.equal(probe.modelAvailable, true);
  assert.ok(calls.some((c) => c.endsWith("/v1/ready")));
  assert.ok(calls.some((c) => c.endsWith("/v1/models")));
  console.log("local-ai-provider.test.ts: probeLocalAIReadiness checks /v1/ready and /v1/models — PASS");
}

async function testProbeReadinessNotConfigured() {
  const probe = await probeLocalAIReadiness({ apiUrl: undefined, apiKey: undefined });
  assert.equal(probe.configured, false);
  assert.equal(probe.reachable, false);
  console.log("local-ai-provider.test.ts: probeLocalAIReadiness reports not_configured without credentials — PASS");
}

function testRoutingDisabledByDefaultDoesNotChangeExistingPolicies() {
  const envDisabled = { ...process.env };
  delete envDisabled.LOCAL_AI_ENABLED;
  const policiesDisabled = buildTaskPolicies(envDisabled);
  assert.equal(isLocalAiRoutingEnabled(envDisabled), false);
  for (const policy of Object.values(policiesDisabled)) {
    assert.ok(
      policy.candidates.every((c) => c.provider !== "local"),
      `${policy.taskClass} must not include a local candidate when LOCAL_AI_ENABLED is unset`,
    );
  }
  // Spot-check exact candidate counts are unchanged from before this integration.
  assert.equal(policiesDisabled.CONTENT.candidates.length, 3);
  assert.equal(policiesDisabled.WEBSITE_ENGINEERING.candidates.length, 4);
  assert.equal(policiesDisabled.WEBSITE_ENGINEERING.maxQualityEscalations, 2);
  console.log("local-ai-provider.test.ts: LOCAL_AI_ENABLED unset leaves every existing task policy byte-for-byte unchanged — PASS");
}

function testRoutingEnabledMakesLocalGenuinePrimaryWhereRealCallersExist() {
  const envEnabled = { ...process.env, LOCAL_AI_ENABLED: "1" };
  const policies = buildTaskPolicies(envEnabled);
  assert.equal(isLocalAiRoutingEnabled(envEnabled), true);

  // CONTENT (real caller: lib/social/agent/provider.ts's Social Copilot chat
  // agent, no structured output) and SALES_CONVERSION (real caller: the
  // Website Factory sales-chat widget) get quality-gated LOCAL-PRIMARY
  // routing -- not escalation-only -- once enabled.
  const content = policies.CONTENT;
  assert.equal(content.candidates[0]!.provider, "local");
  assert.equal(content.candidates[0]!.role, "primary");
  assert.equal(content.candidates[1]!.provider, "google", "Gemini demoted to fallback, still reachable");
  assert.ok(content.candidates.slice(2).every((c) => c.provider === "openai"), "OpenAI still the escalation safety net");

  const sales = policies.SALES_CONVERSION;
  assert.equal(sales.candidates[0]!.provider, "local");
  assert.equal(sales.candidates[0]!.role, "primary");
  assert.equal(sales.maxQualityEscalations, 3, "escalation budget raised so the frontier rung stays reachable");

  // WEBSITE_ENGINEERING's one real caller (prompt-to-spec.ts) requires
  // structuredOutputSchema-conformant JSON, which /v1/code (a plain
  // prompt->generated_code string endpoint) has not been confirmed to
  // support -- deliberately kept escalation-only rather than promoted to
  // primary. See providers/local-ai.ts and task-policies.ts comments.
  const website = policies.WEBSITE_ENGINEERING;
  assert.equal(website.candidates[0]!.provider, "google", "primary stays cloud pending structured-output confirmation");
  assert.equal(website.candidates.at(-1)!.provider, "local");
  assert.equal(website.candidates.at(-1)!.role, "escalation");

  // Every OTHER task class must still have zero local candidates even when enabled.
  for (const [taskClass, policy] of Object.entries(policies)) {
    if (taskClass === "CONTENT" || taskClass === "SALES_CONVERSION" || taskClass === "WEBSITE_ENGINEERING") continue;
    assert.ok(policy.candidates.every((c) => c.provider !== "local"), `${taskClass} must remain untouched`);
  }
  console.log("local-ai-provider.test.ts: LOCAL_AI_ENABLED=1 makes local a genuine quality-gated primary for CONTENT/SALES_CONVERSION, escalation-only for WEBSITE_ENGINEERING, untouched everywhere else — PASS");
}

async function testRuntimeDispatchesToLocalProvider() {
  const usageRecorder = new InMemoryUsageRecorder();
  const local = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch(() =>
      new Response(
        JSON.stringify({ status: "success", provider: "local", model: "qwen2.5:7b", content: "ok", prompt_tokens: 1, completion_tokens: 1 }),
        { status: 200 },
      ),
    ),
  });
  const runtime = new AIRuntime({
    google: { provider: "google", isConfigured: () => false, complete: async () => { throw new Error("unused"); }, probeReadiness: async () => ({ configured: false, reachable: false, modelAvailable: false, lastCheckedAt: null, safeErrorCode: null }) },
    openai: { provider: "openai", isConfigured: () => false, complete: async () => { throw new Error("unused"); }, probeReadiness: async () => ({ configured: false, reachable: false, modelAvailable: false, lastCheckedAt: null, safeErrorCode: null }) },
    local,
    usageRecorder,
  });
  assert.equal(runtime.providerFor("local"), local);
  assert.equal(runtime.isAnyProviderConfigured(), true, "runtime must recognize local as satisfying isAnyProviderConfigured");

  const result = await runtime.execute({
    tenantId: "tenant-1",
    taskClass: "CONTENT",
    messages: [{ role: "user", content: "hi" }],
    routingPolicyOverride: {
      taskClass: "CONTENT",
      candidates: [{ provider: "local", model: "auto", role: "primary", reasoningLevel: "low" }],
      allowWebSearch: false,
      allowGoogleSearchGrounding: false,
      maxAttempts: 1,
      maxQualityEscalations: 0,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "local");
  console.log("local-ai-provider.test.ts: AIRuntime actually dispatches to the local provider end-to-end — PASS");
}

// Safety finding confirmed live (2026-09-05): asked to use a tool, the real
// remote server returned zero real tool_calls and instead hallucinated a
// fake "[Tool called: ...] [Tool response: {...}]" narrative with fabricated
// data, entirely in free text. Any caller that attaches a `tools` schema
// (e.g. Social Copilot's orchestrator, which always does so regardless of
// which taskClass the intent resolves to) must never actually reach local,
// even if local is that task class's configured primary — it must skip
// straight through to the next candidate instead.
async function testRuntimeNeverSendsToolCallingRequestsToLocal() {
  let localWasCalled = false;
  const local = new LocalAITextProvider({
    apiUrl: "https://local.example",
    apiKey: "test-only",
    fetchImpl: fakeFetch(() => {
      localWasCalled = true;
      throw new Error("local must never be attempted for a tools-bearing request");
    }),
  });
  const google = {
    provider: "google" as const,
    isConfigured: () => true,
    complete: async () => ({
      text: "grounded answer",
      toolCalls: [],
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      providerRequestId: null,
    }),
    probeReadiness: async () => ({ configured: true, reachable: true, modelAvailable: true, lastCheckedAt: null, safeErrorCode: null }),
  };
  const runtime = new AIRuntime({
    google,
    openai: { provider: "openai", isConfigured: () => false, complete: async () => { throw new Error("unused"); }, probeReadiness: async () => ({ configured: false, reachable: false, modelAvailable: false, lastCheckedAt: null, safeErrorCode: null }) },
    local,
  });

  const result = await runtime.execute({
    tenantId: "tenant-1",
    taskClass: "CONTENT",
    messages: [{ role: "user", content: "hi" }],
    tools: [{ name: "get_weather", description: "test", parameters: { type: "object", properties: {} } }],
    routingPolicyOverride: {
      taskClass: "CONTENT",
      candidates: [
        { provider: "local", model: "auto", role: "primary", reasoningLevel: "low" },
        { provider: "google", model: "gemini-3.6-flash", role: "fallback", reasoningLevel: "low" },
      ],
      allowWebSearch: false,
      allowGoogleSearchGrounding: false,
      maxAttempts: 2,
      maxQualityEscalations: 0,
    },
  });

  assert.equal(localWasCalled, false, "local must be skipped entirely, not attempted and caught, when tools are attached");
  assert.equal(result.ok, true);
  assert.equal(result.provider, "google", "must transparently fall through to the next real candidate instead");
  console.log("local-ai-provider.test.ts: local is never sent a tool-calling request, for any task class — falls through safely instead — PASS");
}

async function run() {
  await testIsConfiguredRequiresBothUrlAndKey();
  await testCompleteParsesRealChatResponseShape();
  await testCompleteDispatchesCodingModelToCodeEndpoint();
  await testCompleteClassifiesHttpErrors();
  await testCompleteSurfacesFastApiValidationErrorDetail();
  await testProbeReadinessChecksReadyAndModels();
  await testProbeReadinessNotConfigured();
  testRoutingDisabledByDefaultDoesNotChangeExistingPolicies();
  testRoutingEnabledMakesLocalGenuinePrimaryWhereRealCallersExist();
  await testRuntimeDispatchesToLocalProvider();
  await testRuntimeNeverSendsToolCallingRequestsToLocal();
  console.log("local-ai-provider.test.ts: ALL PASS");
}

run();
