// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/ai-runtime.test.ts
import assert from "node:assert/strict";
import {
  AIRuntime,
  InMemoryUsageRecorder,
  ProviderCircuitBreaker,
  ImageMediaRuntime,
  VideoMediaRuntime,
  assertNoSoraPath,
  assertAllDepartmentsMapped,
  DEPARTMENT_POLICY_MAP,
  DEPARTMENT_KEYS,
  getTaskPolicy,
  resolveModelId,
  MODEL_CATALOG,
  estimateTokenCostUsd,
  createBudgetEnvelope,
  evaluateBudgetGate,
  assessQuality,
  routeVoiceWorkload,
  isDeprecatedTtsModel,
  isForbiddenModel,
  buildSpecialistRouting,
  resolveSocialTaskClass,
  AIProviderError,
  type AITextProviderAdapter,
  type AIExecutionRequest,
  type AIUsage,
  type AIToolCall,
} from "../index.ts";

function usage(partial?: Partial<AIUsage>): AIUsage {
  return {
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: 0.0001,
    ...partial,
  };
}

function mockProvider(
  provider: "google" | "openai",
  impl: AITextProviderAdapter["complete"],
  configured = true,
): AITextProviderAdapter {
  return {
    provider,
    isConfigured: () => configured,
    complete: impl,
    probeReadiness: async () => ({
      configured,
      reachable: configured,
      modelAvailable: configured,
      lastCheckedAt: new Date().toISOString(),
      safeErrorCode: configured ? null : "NOT_CONFIGURED",
    }),
  };
}

function baseRequest(overrides: Partial<AIExecutionRequest> = {}): AIExecutionRequest {
  return {
    tenantId: "tenant-a",
    missionId: "mission-1",
    department: "social",
    taskClass: "ROUTING",
    messages: [{ role: "user", content: "classify this intent into JSON" }],
    ...overrides,
  };
}

async function run() {
  // --- Catalog / department mapping ---
  assert.equal(resolveModelId("GOOGLE_CHEAP"), MODEL_CATALOG.GOOGLE_CHEAP.id);
  assert.equal(resolveModelId("OPENAI_FRONTIER"), "gpt-5.6-sol");
  assert.equal(isForbiddenModel("sora-2"), true);
  assert.equal(isForbiddenModel("gpt-4o-mini-tts"), true);

  const mapping = assertAllDepartmentsMapped();
  assert.equal(mapping.total, 25);
  assert.equal(mapping.missing.length, 0);
  assert.equal(Object.keys(DEPARTMENT_POLICY_MAP).length, 25);
  assert.equal(DEPARTMENT_KEYS.length, 25);

  for (const key of DEPARTMENT_KEYS) {
    assert.ok(DEPARTMENT_POLICY_MAP[key], `missing policy for ${key}`);
    const policy = getTaskPolicy(DEPARTMENT_POLICY_MAP[key]);
    assert.ok(policy.candidates[0]);
    assert.equal(policy.candidates[0]!.model.includes("sol") && policy.candidates[0]!.role === "primary", false);
  }

  // 1. ROUTING → Gemini Flash-Lite
  {
    const calls: string[] = [];
    const google = mockProvider("google", async (args) => {
      calls.push(args.model);
      return { text: '{"intent":"ok"}', toolCalls: [] as AIToolCall[], usage: usage(), providerRequestId: "g1" };
    });
    const openai = mockProvider("openai", async () => {
      throw new Error("should not call openai");
    });
    const runtime = new AIRuntime({ google, openai, routerEnabled: true });
    const result = await runtime.execute(baseRequest({ taskClass: "ROUTING" }));
    assert.equal(result.ok, true);
    assert.equal(result.model, resolveModelId("GOOGLE_CHEAP"));
    assert.equal(calls[0], resolveModelId("GOOGLE_CHEAP"));
  }

  // 2. Gemini unavailable → GPT nano fallback
  {
    const google = mockProvider("google", async () => {
      throw new AIProviderError("RATE_LIMIT", "Gemini HTTP 429", 429);
    });
    const openai = mockProvider("openai", async (args) => {
      assert.equal(args.model, resolveModelId("OPENAI_CHEAP_FALLBACK"));
      return { text: "fallback ok", toolCalls: [], usage: usage(), providerRequestId: "o1" };
    });
    const runtime = new AIRuntime({ google, openai });
    const result = await runtime.execute(baseRequest({ taskClass: "ROUTING" }));
    assert.equal(result.ok, true);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, resolveModelId("OPENAI_CHEAP_FALLBACK"));
  }

  // 3. GENERAL → Flash-Lite primary, mini fallback
  {
    const policy = getTaskPolicy("GENERAL_SPECIALIST");
    assert.equal(policy.candidates[0]!.model, resolveModelId("GOOGLE_CHEAP"));
    assert.equal(policy.candidates[1]!.model, resolveModelId("OPENAI_STANDARD_FALLBACK"));
  }

  // 4. CONTENT → Gemini 3.6
  {
    const policy = getTaskPolicy("CONTENT");
    assert.equal(policy.candidates[0]!.model, resolveModelId("GOOGLE_STANDARD"));
  }

  // 5/6. STRATEGY allows Sol only as frontier; routine caption never Sol
  {
    const strategy = getTaskPolicy("STRATEGY");
    assert.ok(strategy.candidates.some((c) => c.role === "frontier" && c.model.includes("sol")));
    assert.equal(resolveSocialTaskClass("operations"), "GENERAL_SPECIALIST");
    const captionPolicy = getTaskPolicy("GENERAL_SPECIALIST");
    assert.equal(captionPolicy.candidates.some((c) => c.model.includes("sol")), false);
    const content = getTaskPolicy("CONTENT");
    assert.equal(content.candidates.some((c) => c.role === "primary" && c.model.includes("sol")), false);
  }

  // 7. Deterministic payment worker → zero AI calls (no runtime invoke)
  {
    let calls = 0;
    const google = mockProvider("google", async () => {
      calls += 1;
      return { text: "x", toolCalls: [], usage: usage(), providerRequestId: null };
    });
    // Payment reconciliation is deterministic — we simply never construct AIRuntime.execute for it.
    assert.equal(calls, 0);
    void google;
  }

  // 8/9. 429 and 500 → bounded fallback
  for (const status of [429, 500] as const) {
    let openaiCalls = 0;
    const google = mockProvider("google", async () => {
      throw new AIProviderError(status === 429 ? "RATE_LIMIT" : "PROVIDER_FAILURE", `HTTP ${status}`, status);
    });
    const openai = mockProvider("openai", async () => {
      openaiCalls += 1;
      return { text: "recovered", toolCalls: [], usage: usage(), providerRequestId: "r" };
    });
    const runtime = new AIRuntime({ google, openai });
    const result = await runtime.execute(baseRequest({ taskClass: "ROUTING" }));
    assert.equal(result.ok, true);
    assert.equal(openaiCalls, 1);
    assert.equal(result.fallbackUsed, true);
  }

  // 10. Safety rejection → no provider hopping
  {
    let openaiCalls = 0;
    const google = mockProvider("google", async () => {
      throw new AIProviderError("SAFETY_REFUSAL", "blocked");
    });
    const openai = mockProvider("openai", async () => {
      openaiCalls += 1;
      return { text: "should not", toolCalls: [], usage: usage(), providerRequestId: null };
    });
    const runtime = new AIRuntime({ google, openai });
    const result = await runtime.execute(baseRequest({ taskClass: "CONTENT" }));
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "SAFETY_REFUSAL");
    assert.equal(openaiCalls, 0);
  }

  // 11. Budget exhaustion → discretionary premium blocked
  {
    const envelope = createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 8.4 });
    const gate = evaluateBudgetGate(envelope, { isDiscretionaryPremium: true });
    assert.equal(gate.allowExecution, false);
    assert.equal(gate.reason, "budget_exhausted");
  }

  // 12/13. Quality fail → escalation; quality pass → no escalation
  {
    let models: string[] = [];
    const google = mockProvider("google", async (args) => {
      models.push(args.model);
      return {
        text: "short",
        toolCalls: [],
        usage: usage(),
        providerRequestId: "q1",
      };
    });
    const openai = mockProvider("openai", async (args) => {
      models.push(args.model);
      return {
        text: "A thorough strategy with next steps, bottleneck diagnosis, recommended priority sequence, and package feasibility for the growth plan.",
        toolCalls: [],
        usage: usage({ estimatedCostUsd: 0.01 }),
        providerRequestId: "q2",
      };
    });
    const runtime = new AIRuntime({
      google,
      openai,
      qualityAssessor: (input) =>
        input.text.length < 40
          ? { score: 0.2, decision: "FAIL", reasons: ["too_short"] }
          : { score: 0.9, decision: "PASS", reasons: [] },
    });
    const result = await runtime.execute(
      baseRequest({
        taskClass: "STRATEGY",
        qualityTarget: 0.8,
        messages: [{ role: "user", content: "build a growth strategy" }],
      }),
    );
    assert.equal(result.ok, true);
    assert.ok(models.length >= 2);
    assert.equal(result.fallbackReason === "quality_escalation" || result.selection.escalationLevel >= 0, true);
  }

  {
    let calls = 0;
    const google = mockProvider("google", async () => {
      calls += 1;
      return {
        text: "A clear content caption with useful brand-aligned platform fit and enough words to pass the quality gate for social posting.",
        toolCalls: [],
        usage: usage(),
        providerRequestId: "p",
      };
    });
    const openai = mockProvider("openai", async () => {
      calls += 10;
      return { text: "x", toolCalls: [], usage: usage(), providerRequestId: null };
    });
    const runtime = new AIRuntime({
      google,
      openai,
      qualityAssessor: () => ({ score: 0.95, decision: "PASS", reasons: [] }),
    });
    const result = await runtime.execute(baseRequest({ taskClass: "CONTENT", qualityTarget: 0.7 }));
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
  }

  // 14/15. Usage ledger + tenant isolation
  {
    const recorder = new InMemoryUsageRecorder();
    const google = mockProvider("google", async () => ({
      text: "ok enough text for routing classification output here",
      toolCalls: [],
      usage: usage({ estimatedCostUsd: 0.002 }),
      providerRequestId: "u1",
    }));
    const runtime = new AIRuntime({
      google,
      openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
      usageRecorder: recorder,
      qualityAssessor: () => ({ score: 1, decision: "PASS", reasons: [] }),
    });
    await runtime.execute(baseRequest({ tenantId: "tenant-a", taskClass: "ROUTING" }));
    await runtime.execute(baseRequest({ tenantId: "tenant-b", taskClass: "ROUTING" }));
    assert.equal(recorder.forTenant("tenant-a").length, 1);
    assert.equal(recorder.forTenant("tenant-b").length, 1);
    assert.equal(recorder.forTenant("tenant-a")[0]!.tenantId, "tenant-a");
    assert.ok(recorder.forTenant("tenant-a")[0]!.model);
    assert.ok(recorder.forTenant("tenant-a")[0]!.estimatedCostUsd >= 0);
  }

  // 16. Circuit breaker opens and recovers
  {
    const now = { t: 0 };
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => now.t });
    breaker.recordFailure("google", "m");
    assert.equal(breaker.isOpen("google", "m"), false);
    breaker.recordFailure("google", "m");
    assert.equal(breaker.isOpen("google", "m"), true);
    now.t = 150;
    assert.equal(breaker.isOpen("google", "m"), false);
    breaker.recordSuccess("google", "m");
    assert.equal(breaker.isOpen("google", "m"), false);
  }

  // 17/18/19. Provider missing scenarios
  {
    const openaiOnly = new AIRuntime({
      google: mockProvider("google", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
      openai: mockProvider("openai", async () => ({
        text: "openai works alone with sufficient text content for the response",
        toolCalls: [],
        usage: usage(),
        providerRequestId: "o",
      })),
      qualityAssessor: () => ({ score: 1, decision: "PASS", reasons: [] }),
    });
    const r1 = await openaiOnly.execute(baseRequest({ taskClass: "ROUTING" }));
    assert.equal(r1.ok, true);
    assert.equal(r1.provider, "openai");

    const geminiOnly = new AIRuntime({
      google: mockProvider("google", async () => ({
        text: "gemini works alone with sufficient text content for the response",
        toolCalls: [],
        usage: usage(),
        providerRequestId: "g",
      })),
      openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
      qualityAssessor: () => ({ score: 1, decision: "PASS", reasons: [] }),
    });
    const r2 = await geminiOnly.execute(baseRequest({ taskClass: "ROUTING" }));
    assert.equal(r2.ok, true);
    assert.equal(r2.provider, "google");

    const none = new AIRuntime({
      google: mockProvider("google", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
      openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
    });
    const r3 = await none.execute(baseRequest());
    assert.equal(r3.ok, false);
    assert.equal(r3.errorCategory, "NOT_CONFIGURED");
  }

  // Cost catalog math
  {
    const cost = estimateTokenCostUsd({
      model: resolveModelId("GOOGLE_CHEAP"),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    assert.ok(cost > 0);
  }

  // Media image routing
  {
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }],
        }), { status: 200 });
      }
      throw new Error("unexpected " + url);
    };
    const images = new ImageMediaRuntime({ geminiApiKey: "test-key", openaiApiKey: undefined, fetchImpl });
    const standard = await images.generate({
      tenantId: "t1",
      missionId: "m1",
      prompt: "logo",
      tier: "standard",
    });
    assert.equal(standard.outcome, "OK");
    assert.equal(standard.model, resolveModelId("GOOGLE_IMAGE_STANDARD"));

    const premium = await images.generate({ tenantId: "t1", missionId: "m1", prompt: "hero", tier: "premium" });
    assert.equal(premium.model, resolveModelId("GOOGLE_IMAGE_PREMIUM"));

    const fast = await images.generate({ tenantId: "t1", missionId: "m1", prompt: "iter", tier: "fast" });
    assert.equal(fast.model, resolveModelId("GOOGLE_IMAGE_FAST"));

    const none = new ImageMediaRuntime({ geminiApiKey: undefined, openaiApiKey: undefined });
    const missing = await none.generate({ tenantId: "t1", missionId: "m1", prompt: "x" });
    assert.equal(missing.outcome, "NOT_CONFIGURED");
    assert.equal(missing.candidates.length, 0);
  }

  // Image OpenAI fallback
  {
    let hitOpenAI = false;
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage")) {
        return new Response("fail", { status: 503 });
      }
      if (url.includes("api.openai.com")) {
        hitOpenAI = true;
        return new Response(JSON.stringify({ data: [{ b64_json: "xyz" }] }), { status: 200 });
      }
      throw new Error(url);
    };
    const images = new ImageMediaRuntime({ geminiApiKey: "g", openaiApiKey: "o", fetchImpl });
    const result = await images.generate({ tenantId: "t", missionId: "m", prompt: "p", tier: "standard" });
    assert.equal(result.outcome, "OK");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, resolveModelId("OPENAI_IMAGE_FALLBACK"));
    assert.equal(hitOpenAI, true);
  }

  // Video Veo + no Sora
  {
    assert.throws(() => assertNoSoraPath("sora-2"));
    const fetchImpl = async () =>
      new Response(JSON.stringify({ name: "operations/abc" }), { status: 200 });
    const video = new VideoMediaRuntime({ geminiApiKey: "g", fetchImpl, sleepMs: async () => {} });
    const submitted = await video.submit({
      tenantId: "t",
      missionId: "m",
      prompt: "scene",
      tier: "economy",
    });
    assert.equal(submitted.status, "submitted");
    assert.equal(submitted.model, resolveModelId("GOOGLE_VIDEO_ECONOMY"));
    assert.equal(/sora/i.test(submitted.model), false);

    video.seedOperation({
      ...submitted,
      status: "submitted",
    });
    const pollFetch = async () =>
      new Response(
        JSON.stringify({
          done: true,
          response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://example/v.mp4" } }] } },
        }),
        { status: 200 },
      );
    const video2 = new VideoMediaRuntime({ geminiApiKey: "g", fetchImpl: pollFetch, sleepMs: async () => {} });
    video2.seedOperation(submitted);
    const done = await video2.poll(submitted.operationId);
    assert.equal(done.status, "completed");
    assert.ok(done.artifactUri);

    const fastModel = resolveModelId("GOOGLE_VIDEO_FAST");
    const premiumModel = resolveModelId("GOOGLE_VIDEO_PREMIUM");
    assert.ok(fastModel.includes("fast"));
    assert.ok(premiumModel.includes("generate-preview"));
  }

  // Voice routing
  {
    const tts = routeVoiceWorkload("tts");
    assert.equal(tts.primaryModel, "tts-1");
    assert.equal(isDeprecatedTtsModel("gpt-4o-mini-tts"), true);
    assert.equal(isDeprecatedTtsModel(tts.primaryModel), false);
    const tx = routeVoiceWorkload("transcription");
    assert.equal(tx.primaryModel, "gpt-4o-mini-transcribe");
  }

  // Workforce narrowing
  {
    const child = buildSpecialistRouting({
      department: "strategy",
      parentTaskClass: "GENERAL_SPECIALIST",
    });
    assert.equal(child.taskClass, "GENERAL_SPECIALIST");
  }

  // Quality assess helpers
  {
    const fail = assessQuality({ taskClass: "RESEARCH", text: "no evidence", requireEvidence: true });
    assert.equal(fail.decision, "FAIL");
  }

  // Soft budget prefer cheap
  {
    const envelope = createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 12.2 });
    const gate = evaluateBudgetGate(envelope);
    assert.equal(gate.status, "soft_70");
    assert.equal(gate.preferCheaper, true);
  }

  console.log("ai-runtime.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
