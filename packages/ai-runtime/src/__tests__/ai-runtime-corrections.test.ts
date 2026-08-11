// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/ai-runtime-corrections.test.ts
import assert from "node:assert/strict";
import {
  estimateTokenCostUsd,
  estimateImageCostUsd,
  estimateOpenAIImageTokenCostUsd,
  estimateVideoCostUsd,
  resolveModelId,
  toResponsesInput,
  extractOpenAIResponseText,
  createTenantAIRuntime,
  createBudgetEnvelope,
  evaluateBudgetGate,
  InMemoryUsageRecorder,
  SupabaseUsageRecorder,
  VideoMediaRuntime,
  SupabaseVideoOperationStore,
  ImageMediaRuntime,
  InMemoryCanonicalMediaStorage,
  buildAiAdminHealthSnapshot,
  AIRuntime,
  type AITextProviderAdapter,
  type AIToolCall,
  type AIUsage,
} from "../index.ts";
import {
  buildSocialOutboundBoundary,
  assertSocialOutboundSafe,
  mapCopilotIntentToTaskClass,
} from "../../../../lib/social/agent/social-outbound-boundary.ts";
import { resolveImageGenerationRuntimeStatus } from "../../../../lib/social/agent/capability-evidence.ts";

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

/** Fake persistent Supabase backend shared across store instances. */
function createFakePersistentSupabase() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const ensure = (table: string) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table)!;
  };
  return {
    tables,
    from(table: string) {
      return {
        upsert: async (row: Record<string, unknown>) => {
          const key = String(row.provider_operation_id ?? row.id ?? crypto.randomUUID());
          ensure(table).set(key, { ...row });
          return { error: null };
        },
        insert: async (row: Record<string, unknown>) => {
          const key = String(row.request_id ?? row.id ?? crypto.randomUUID());
          ensure(table).set(key, { ...row });
          return { error: null };
        },
        select: (_cols: string) => ({
          eq: (col: string, val: string) => ({
            maybeSingle: async () => {
              for (const row of ensure(table).values()) {
                if (String(row[col]) === val) return { data: row, error: null };
              }
              return { data: null, error: null };
            },
            gte: async () => ({ data: [...ensure(table).values()], error: null }),
            limit: async () => ({ error: null }),
          }),
          limit: async () => ({ error: null }),
        }),
      };
    },
  };
}

async function run() {
  // Official pricing — Gemini 3 Pro Image corrected
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_PREMIUM"), 1, { resolution: "1K" }), 0.134);
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_PREMIUM"), 1, { resolution: "2K" }), 0.134);
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_PREMIUM"), 1, { resolution: "4K" }), 0.24);

  assert.equal(
    estimateTokenCostUsd({
      model: resolveModelId("OPENAI_CHEAP_FALLBACK"),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    1.45,
  );
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_STANDARD"), 1, { resolution: "1K" }), 0.067);
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_FAST"), 1, { resolution: "1K" }), 0.0336);
  assert.equal(
    estimateImageCostUsd(resolveModelId("OPENAI_IMAGE_FALLBACK"), 1, { quality: "high", size: "1024x1024" }),
    0.211,
  );
  assert.ok(estimateOpenAIImageTokenCostUsd({ imageOutputTokens: 1120 }) > 0);
  assert.equal(estimateVideoCostUsd(resolveModelId("GOOGLE_VIDEO_ECONOMY"), 10, { resolution: "720p" }), 0.5);

  // Social assistant/tool Platform-data boundary (same for Google + OpenAI)
  {
    const envelope = buildSocialOutboundBoundary({
      messages: [
        { role: "system", content: "Help with brand. Meta page id 12345678 and access_token=secret." },
        { role: "user", content: "Write a caption. Check Instagram insights and comments inbox." },
        {
          role: "assistant",
          content: "I looked at your insights and page id 999 before drafting.",
          toolCalls: [{ id: "c1", name: "create_content_variant", arguments: { note: "insights summary" } }],
        },
        {
          role: "tool",
          content: "insights=1200; page id=abc; access_token=should_not_leak",
          toolCallId: "c1",
          toolName: "create_content_variant",
        },
      ],
      context: {
        brandInstructions: ["Voice: warm."],
        businessInformation: ["We sell tea."],
      },
    });
    assertSocialOutboundSafe(envelope);
    assert.match(envelope.messages[1]!.content, /REDACTED PLATFORM DATA/i);
    assert.match(envelope.messages[2]!.content, /REDACTED PLATFORM DATA/i);
    assert.match(envelope.messages[3]!.content, /REDACTED PLATFORM DATA/i);
    assert.equal(/\binsights\b/i.test(envelope.messages[2]!.content), false);
    assert.equal(/\binsights\b/i.test(envelope.messages[3]!.content), false);
    assert.equal(envelope.messages[3]!.toolCallId, "c1");
    assert.equal(envelope.messages[3]!.toolName, "create_content_variant");
    assert.equal(envelope.messages[2]!.toolCalls?.[0]?.id, "c1");
  }

  assert.equal(mapCopilotIntentToTaskClass("PREPARE_CONTENT"), "CONTENT");
  assert.equal(mapCopilotIntentToTaskClass("CAMPAIGN_STRATEGY"), "STRATEGY");

  assert.throws(
    () => createTenantAIRuntime({ tenantId: "social-session", plan: "starter", spentUsdThisMonth: 0 }),
    /tenant_required/,
  );

  // Safe monthly-spend rollout — missing ledger must NOT silently mean $0
  {
    const broken = {
      from: () => ({
        insert: async () => ({ error: { message: 'relation "ai_execution_usage" does not exist' } }),
        select: () => ({
          eq: () => ({
            gte: async () => ({
              data: null,
              error: { message: 'relation "ai_execution_usage" does not exist' },
            }),
          }),
        }),
      }),
    };
    const recorder = new SupabaseUsageRecorder(broken as never);
    const resolved = await recorder.resolveMonthSpend!("t1", "2026-08");
    assert.equal(resolved.ok, false);
    if (!resolved.ok) assert.equal(resolved.reason, "ledger_unavailable");

    // provider_usage_events fallback/read compatibility
    const legacyRows: Record<string, unknown>[] = [];
    const hybrid = {
      from: (table: string) => ({
        insert: async (row: Record<string, unknown>) => {
          if (table === "ai_execution_usage") return { error: { message: 'relation "ai_execution_usage" does not exist' } };
          legacyRows.push(row);
          return { error: null };
        },
        select: (cols: string) => ({
          eq: () => ({
            gte: async () => {
              if (table === "ai_execution_usage") {
                return { data: null, error: { message: 'relation "ai_execution_usage" does not exist' } };
              }
              return {
                data: legacyRows.map((r) => ({ cost_cents: r.cost_cents })),
                error: null,
              };
            },
          }),
        }),
      }),
    };
    const hybridRecorder = new SupabaseUsageRecorder(hybrid as never);
    await hybridRecorder.record({
      tenantId: "t1",
      missionId: null,
      department: "social",
      specialistRole: null,
      taskClass: "CONTENT",
      provider: "google",
      model: "m",
      attemptNumber: 1,
      fallbackUsed: false,
      fallbackReason: "none",
      escalationLevel: 0,
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 1.5,
      latencyMs: 1,
      success: true,
      errorCategory: null,
      selectionReason: "m",
      requestId: "r1",
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    assert.equal(legacyRows.length, 1);
    const legacySpend = await hybridRecorder.resolveMonthSpend!("t1", "2026-08");
    assert.equal(legacySpend.ok, true);
    if (legacySpend.ok) {
      assert.equal(legacySpend.source, "provider_usage_events");
      assert.equal(legacySpend.spentUsd, 1.5);
    }
  }

  // Every provider attempt accounted — including quality-failed successful calls
  {
    const recorder = new InMemoryUsageRecorder();
    let calls = 0;
    const google = mockProvider("google", async () => {
      calls += 1;
      return {
        text: calls === 1 ? "short" : "A thorough strategy with next steps, bottleneck diagnosis, recommended priority sequence, and package feasibility for the growth plan.",
        toolCalls: [] as AIToolCall[],
        usage: usage({ estimatedCostUsd: 0.05 }),
        providerRequestId: `g${calls}`,
      };
    });
    const openai = mockProvider("openai", async () => ({
      text: "A thorough strategy with next steps, bottleneck diagnosis, recommended priority sequence, and package feasibility for the growth plan.",
      toolCalls: [],
      usage: usage({ estimatedCostUsd: 0.2 }),
      providerRequestId: "o1",
    }));
    const runtime = new AIRuntime({
      google,
      openai,
      usageRecorder: recorder,
      qualityAssessor: (input) =>
        input.text.length < 40
          ? { score: 0.2, decision: "FAIL", reasons: ["too_short"] }
          : { score: 0.9, decision: "PASS", reasons: [] },
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      taskClass: "STRATEGY",
      qualityTarget: 0.8,
      messages: [{ role: "user", content: "build a growth strategy" }],
      budgetEnvelope: createBudgetEnvelope({ plan: "scale", spentUsdThisMonth: 0 }),
    });
    assert.equal(result.ok, true);
    assert.ok(recorder.entries.length >= 2, "quality-failed first attempt must still be recorded");
    assert.ok(recorder.entries.every((e) => e.success === true));
  }

  // In-request accumulated-cost budget recheck before escalation
  {
    const recorder = new InMemoryUsageRecorder();
    const google = mockProvider("google", async () => ({
      text: "short",
      toolCalls: [],
      usage: usage({ estimatedCostUsd: 7 }),
      providerRequestId: "g",
    }));
    const openai = mockProvider("openai", async () => {
      throw new Error("should not escalate when budget blocks discretionary premium");
    });
    const runtime = new AIRuntime({
      google,
      openai,
      usageRecorder: recorder,
      qualityAssessor: () => ({ score: 0.1, decision: "FAIL", reasons: ["too_short"] }),
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      taskClass: "STRATEGY",
      qualityTarget: 0.9,
      messages: [{ role: "user", content: "strategy" }],
      budgetEnvelope: createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 1.5 }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorDetailSafe, "quality_gate_failed");
    assert.equal(recorder.entries.length, 1);
  }

  // Image + video usage included in COGS ledger
  {
    const recorder = new InMemoryUsageRecorder();
    const storage = new InMemoryCanonicalMediaStorage();
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }],
        }),
        { status: 200 },
      );
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      fetchImpl,
      storage,
      requireStorageForOperational: true,
      usageRecorder: recorder,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
    });
    const img = await images.generate({
      tenantId: "t1",
      missionId: "m1",
      prompt: "logo",
      candidateCount: 1,
      persistCanonical: true,
    });
    assert.equal(img.outcome, "OK");
    assert.ok(recorder.entries.some((e) => e.selectionReason.startsWith("image:")));

    const db = createFakePersistentSupabase();
    const store = new SupabaseVideoOperationStore(db as never);
    const video = new VideoMediaRuntime({
      geminiApiKey: "g",
      store,
      storage,
      usageRecorder: recorder,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
      fetchImpl: async () => new Response(JSON.stringify({ name: "operations/v1" }), { status: 200 }),
      sleepMs: async () => {},
    });
    const submitted = await video.submit({ tenantId: "t1", missionId: "m1", prompt: "scene" });
    assert.equal(submitted.status, "submitted");
    assert.ok(recorder.entries.some((e) => e.selectionReason.startsWith("video:")));
  }

  // Real restart test: two separate store instances + fake persistent backend
  {
    const db = createFakePersistentSupabase();
    const storeA = new SupabaseVideoOperationStore(db as never);
    const storeB = new SupabaseVideoOperationStore(db as never);
    assert.notEqual(storeA, storeB);
    const runtime1 = new VideoMediaRuntime({
      geminiApiKey: "g",
      store: storeA,
      fetchImpl: async () => new Response(JSON.stringify({ name: "operations/restart" }), { status: 200 }),
      sleepMs: async () => {},
    });
    const submitted = await runtime1.submit({ tenantId: "t", missionId: "m", prompt: "scene" });
    assert.equal(submitted.status, "submitted");

    const runtime2 = new VideoMediaRuntime({
      geminiApiKey: "g",
      store: storeB,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            done: true,
            response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://example.com/v.mp4" } }] } },
          }),
          { status: 200 },
        ),
      sleepMs: async () => {},
    });
    const done = await runtime2.poll(submitted.operationId);
    assert.equal(done.status, "completed");
    assert.ok(done.artifactUri);
  }

  // Durable-store persistence errors handled truthfully
  {
    const failing = {
      from: () => ({
        upsert: async () => ({ error: { message: "permission denied" } }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const store = new SupabaseVideoOperationStore(failing as never);
    const runtime = new VideoMediaRuntime({
      geminiApiKey: "g",
      store,
      fetchImpl: async () => new Response(JSON.stringify({ name: "operations/x" }), { status: 200 }),
      sleepMs: async () => {},
    });
    const submitted = await runtime.submit({ tenantId: "t", missionId: "m", prompt: "scene" });
    assert.equal(submitted.status, "failed");
    assert.match(String(submitted.errorSafe), /durable_store_save_failed/);
  }

  // System Health checks storage + durable + budget ledger
  {
    const snap = await buildAiAdminHealthSnapshot({
      fetchImpl: async () => new Response("fail", { status: 503 }),
      storageReady: false,
      durableVideoStoreReady: false,
      budgetLedgerReady: false,
    });
    assert.equal(snap.budgetLedgerReady, false);
    assert.equal(snap.image.storageReady, false);
    assert.notEqual(snap.image.status, "operational");
    assert.equal(snap.video.durableStoreReady, false);
    assert.equal(resolveImageGenerationRuntimeStatus({ providerConfigured: true }), "WAITING_CONFIGURATION");
  }

  // Budget 70/85/100
  {
    const soft = evaluateBudgetGate(createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 6 }));
    assert.equal(soft.status, "soft_70");
    const hard = evaluateBudgetGate(createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 8.4 }));
    assert.equal(hard.allowExecution, false);
  }

  // OpenAI multi-round + no duplicate text + web_search
  {
    const input = toResponsesInput([
      { role: "user", content: "prepare post" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "create_content_variant", arguments: { caption: "hi" } }],
      },
      { role: "tool", content: '{"ok":true}', toolCallId: "call_1", toolName: "create_content_variant" },
    ]);
    assert.equal(input.find((i) => i.type === "function_call")!.call_id, "call_1");
    assert.equal(input.find((i) => i.type === "function_call_output")!.call_id, "call_1");
    assert.equal(
      extractOpenAIResponseText({
        output_text: "Hello",
        output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }],
      }),
      "Hello",
    );
    const src = await import("node:fs");
    const openaiSrc = src.readFileSync(new URL("../providers/openai.ts", import.meta.url), "utf8");
    assert.ok(openaiSrc.includes('type: "web_search"'));
    assert.equal(openaiSrc.includes("web_search_preview"), false);
  }

  console.log("ai-runtime-corrections.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
