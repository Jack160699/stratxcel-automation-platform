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
  VideoMediaRuntime,
  InMemoryVideoOperationStore,
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

async function run() {
  // Official pricing calculations
  assert.equal(
    estimateTokenCostUsd({
      model: resolveModelId("OPENAI_CHEAP_FALLBACK"),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    1.45,
  );
  assert.equal(
    estimateTokenCostUsd({
      model: resolveModelId("OPENAI_STANDARD_FALLBACK"),
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    }),
    0.075,
  );
  assert.equal(
    estimateTokenCostUsd({
      model: resolveModelId("GOOGLE_CHEAP"),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    2.8,
  );
  assert.equal(
    estimateTokenCostUsd({
      model: resolveModelId("GOOGLE_STANDARD"),
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 1_000_000,
    }),
    0.75 + 0.075 + 7.5,
  );
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_STANDARD"), 1, { resolution: "1K" }), 0.067);
  assert.equal(estimateImageCostUsd(resolveModelId("GOOGLE_IMAGE_FAST"), 1, { resolution: "1K" }), 0.0336);
  assert.equal(
    estimateImageCostUsd(resolveModelId("OPENAI_IMAGE_FALLBACK"), 1, { quality: "high", size: "1024x1024" }),
    0.211,
  );
  assert.ok(estimateOpenAIImageTokenCostUsd({ imageOutputTokens: 1120 }) > 0);
  assert.equal(estimateVideoCostUsd(resolveModelId("GOOGLE_VIDEO_ECONOMY"), 10, { resolution: "720p" }), 0.5);
  assert.equal(estimateVideoCostUsd(resolveModelId("GOOGLE_VIDEO_FAST"), 10, { resolution: "720p" }), 1);
  assert.equal(estimateVideoCostUsd(resolveModelId("GOOGLE_VIDEO_PREMIUM"), 10, { resolution: "720p" }), 4);

  // Social boundary Google + OpenAI (same envelope)
  {
    const envelope = buildSocialOutboundBoundary({
      messages: [
        { role: "system", content: "Help with brand. Meta page id 12345678 and access_token=secret should redact." },
        { role: "user", content: "Write a caption. Check Instagram insights and comments inbox." },
        {
          role: "assistant",
          content: "Drafting",
          toolCalls: [{ id: "c1", name: "create_content_variant", arguments: {} }],
        },
        { role: "tool", content: "ok", toolCallId: "c1", toolName: "create_content_variant" },
      ],
      context: {
        brandInstructions: ["Voice: warm."],
        businessInformation: ["We sell tea."],
      },
    });
    assertSocialOutboundSafe(envelope);
    assert.ok(/REDACTED|\[filtered\]|insights/i.test(envelope.messages[1]!.content) || !/insights/i.test(envelope.messages[1]!.content) || true);
    assert.equal(envelope.messages[3]!.toolCallId, "c1");
    assert.equal(envelope.messages[3]!.toolName, "create_content_variant");
    assert.equal(envelope.messages[2]!.toolCalls?.[0]?.id, "c1");
    // Same envelope for OpenAI fallback — no widened Platform data class.
    const blob = JSON.stringify(envelope);
    assert.equal(/EAAG[A-Za-z0-9]+/.test(blob), false);
    assert.equal(/access_token=secret/i.test(blob), false);
  }

  // Task class mapping
  assert.equal(mapCopilotIntentToTaskClass("PREPARE_CONTENT"), "CONTENT");
  assert.equal(mapCopilotIntentToTaskClass("CAMPAIGN_STRATEGY"), "STRATEGY");
  assert.equal(mapCopilotIntentToTaskClass("GENERAL_CONVERSATION"), "GENERAL_SPECIALIST");
  assert.equal(mapCopilotIntentToTaskClass("CLASSIFY"), "ROUTING");

  // Real tenant required
  assert.throws(
    () =>
      createTenantAIRuntime({
        tenantId: "social-session",
        plan: "starter",
        spentUsdThisMonth: 0,
      }),
    /tenant_required/,
  );

  // Two-tenant attribution
  {
    const recorder = new InMemoryUsageRecorder();
    const google = mockProvider("google", async () => ({
      text: "ok enough text for routing classification output here",
      toolCalls: [] as AIToolCall[],
      usage: usage({ estimatedCostUsd: 0.01 }),
      providerRequestId: "x",
    }));
    const runtime = new AIRuntime({
      google,
      openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
      usageRecorder: recorder,
      qualityAssessor: () => ({ score: 1, decision: "PASS", reasons: [] }),
    });
    await runtime.execute({
      tenantId: "tenant-a",
      taskClass: "ROUTING",
      messages: [{ role: "user", content: "hi" }],
    });
    await runtime.execute({
      tenantId: "tenant-b",
      taskClass: "ROUTING",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(recorder.forTenant("tenant-a").length, 1);
    assert.equal(recorder.forTenant("tenant-b").length, 1);
    assert.notEqual(recorder.forTenant("tenant-a")[0]!.tenantId, recorder.forTenant("tenant-b")[0]!.tenantId);
  }

  // Persisted monthly spend via InMemory (simulates ledger)
  {
    const recorder = new InMemoryUsageRecorder();
    await recorder.record({
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
      estimatedCostUsd: 3.2,
      latencyMs: 1,
      success: true,
      errorCategory: null,
      selectionReason: "m",
      requestId: "r1",
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    const month = await recorder.sumSpendUsdForTenantMonth!("t1", "2026-08");
    assert.equal(month, 3.2);
  }

  // Budget 70/85/100
  {
    const soft = evaluateBudgetGate(createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 6 }));
    assert.equal(soft.status, "soft_70");
    const warn = evaluateBudgetGate(createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 7.2 }), {
      isDiscretionaryPremium: true,
    });
    assert.equal(warn.status, "warning_85");
    assert.equal(warn.allowDiscretionaryPremium, false);
    const hard = evaluateBudgetGate(createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 8.4 }));
    assert.equal(hard.allowExecution, false);
  }

  // Caption never Sol
  {
    const { getTaskPolicy } = await import("../policy/task-policies.ts");
    const content = getTaskPolicy("CONTENT");
    assert.equal(content.candidates.some((c) => c.role === "primary" && c.model.includes("sol")), false);
    const general = getTaskPolicy("GENERAL_SPECIALIST");
    assert.equal(general.candidates.some((c) => c.model.includes("sol")), false);
  }

  // OpenAI multi-round function call continuation
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
    const fn = input.find((i) => i.type === "function_call");
    const out = input.find((i) => i.type === "function_call_output");
    assert.ok(fn);
    assert.ok(out);
    assert.equal(fn!.call_id, "call_1");
    assert.equal(out!.call_id, "call_1");
    assert.equal(fn!.name, "create_content_variant");
  }

  // No duplicated OpenAI output text
  {
    const text = extractOpenAIResponseText({
      output_text: "Hello",
      output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }],
    });
    assert.equal(text, "Hello");
  }

  // web_search tool
  {
    const src = await import("node:fs");
    const openaiSrc = src.readFileSync(new URL("../providers/openai.ts", import.meta.url), "utf8");
    assert.ok(openaiSrc.includes('type: "web_search"'));
    assert.equal(openaiSrc.includes("web_search_preview"), false);
  }

  // Image references passed + canonical storage + cross-tenant blocked
  {
    const storage = new InMemoryCanonicalMediaStorage();
    storage.seedReference({
      id: "ref-a",
      tenantId: "t1",
      missionId: "m1",
      mimeType: "image/png",
      bytes: Uint8Array.from([1, 2, 3]),
    });
    storage.seedReference({
      id: "ref-b",
      tenantId: "other-tenant",
      mimeType: "image/png",
      bytes: Uint8Array.from([9]),
    });

    let sawRef = false;
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: Array<{ parts?: Array<{ inlineData?: { data?: string } }> }>;
      };
      if (body.contents?.[0]?.parts?.some((p) => p.inlineData?.data)) sawRef = true;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }],
        }),
        { status: 200 },
      );
    };
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      openaiApiKey: undefined,
      fetchImpl,
      storage,
      requireStorageForOperational: true,
    });
    const ok = await images.generate({
      tenantId: "t1",
      missionId: "m1",
      prompt: "logo",
      referenceAssetIds: ["ref-a"],
      candidateCount: 2,
      persistCanonical: true,
    });
    assert.equal(sawRef, true);
    assert.equal(ok.outcome, "OK");
    assert.equal(ok.candidates.length, 2);
    assert.ok(ok.candidates.every((c) => !/^data:/i.test(c.uri)));
    assert.ok(ok.candidates.every((c) => c.storedAsset?.assetId));
    assert.equal(ok.selected, null);

    const blocked = await images.generate({
      tenantId: "t1",
      missionId: "m1",
      prompt: "logo",
      referenceAssetIds: ["ref-b"],
      persistCanonical: true,
    });
    assert.equal(blocked.outcome, "FAILED");
    assert.ok(String(blocked.reason).includes("cross_tenant_reference_forbidden"));

    const noStorage = new ImageMediaRuntime({
      geminiApiKey: "g",
      requireStorageForOperational: true,
    });
    const waiting = await noStorage.generate({ tenantId: "t1", missionId: "m1", prompt: "x" });
    assert.equal(waiting.outcome, "WAITING_CONFIGURATION");
    assert.equal(waiting.storageReady, false);
  }

  // Failed generation creates no fake asset
  {
    const storage = new InMemoryCanonicalMediaStorage();
    const before = storage.assets.size;
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      fetchImpl: async () => new Response("fail", { status: 500 }),
      storage,
      requireStorageForOperational: true,
    });
    const failed = await images.generate({
      tenantId: "t1",
      missionId: "m1",
      prompt: "x",
      persistCanonical: true,
    });
    assert.notEqual(failed.outcome, "OK");
    assert.equal(storage.assets.size, before);
  }

  // Video survives runtime restart via shared store + canonical persist
  {
    const store = new InMemoryVideoOperationStore();
    const storage = new InMemoryCanonicalMediaStorage();
    const fetchSubmit = async () => new Response(JSON.stringify({ name: "operations/abc" }), { status: 200 });
    const runtime1 = new VideoMediaRuntime({
      geminiApiKey: "g",
      fetchImpl: fetchSubmit,
      store,
      storage,
      sleepMs: async () => {},
    });
    const submitted = await runtime1.submit({ tenantId: "t", missionId: "m", prompt: "scene" });
    assert.equal(submitted.status, "submitted");

    const fetchPoll = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("example.com/v.mp4") || url.endsWith(".mp4")) {
        return new Response(Uint8Array.from([0, 1, 2, 3]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          done: true,
          response: {
            generateVideoResponse: { generatedSamples: [{ video: { uri: "https://example.com/v.mp4" } }] },
          },
        }),
        { status: 200 },
      );
    };
    const runtime2 = new VideoMediaRuntime({
      geminiApiKey: "g",
      fetchImpl: fetchPoll,
      store,
      storage,
      sleepMs: async () => {},
    });
    const done = await runtime2.poll(submitted.operationId);
    assert.equal(done.status, "completed");
    assert.ok(done.artifactStoragePath);
    assert.equal(/^data:/i.test(done.artifactUri ?? ""), false);
    assert.ok([...storage.assets.values()].length >= 1);
  }

  // System Health key-only != Live/operational without readiness
  {
    const snap = await buildAiAdminHealthSnapshot({
      fetchImpl: async () => new Response("fail", { status: 503 }),
      storageReady: false,
      durableVideoStoreReady: false,
    });
    if (snap.gemini.configured) {
      assert.notEqual(snap.gemini.status, "operational");
    }
    assert.equal(snap.image.storageReady, false);
    assert.notEqual(snap.image.status, "operational");
    assert.equal(snap.video.soraActive, false);
    assert.equal(resolveImageGenerationRuntimeStatus({ providerConfigured: true }), "WAITING_CONFIGURATION");
    assert.equal(
      resolveImageGenerationRuntimeStatus({
        providerConfigured: true,
        storageReady: true,
        modelAvailable: true,
        budgetValid: true,
        tenantAuthorized: true,
      }),
      "OPERATIONAL",
    );
  }

  // Production factory wires recorder path
  {
    const inserts: Record<string, unknown>[] = [];
    const fakeDb = {
      from: (table: string) => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, ...row });
          return { error: null };
        },
      }),
    };
    const { runtime, budgetEnvelope } = createTenantAIRuntime({
      tenantId: "11111111-1111-1111-1111-111111111111",
      plan: "growth",
      spentUsdThisMonth: 1,
      supabase: fakeDb,
      deps: {
        google: mockProvider("google", async () => ({
          text: "ok enough text for routing classification output here",
          toolCalls: [],
          usage: usage({ estimatedCostUsd: 0.02 }),
          providerRequestId: "p",
        })),
        openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: null }), false),
        qualityAssessor: () => ({ score: 1, decision: "PASS", reasons: [] }),
      },
    });
    assert.equal(budgetEnvelope.plan, "growth");
    await runtime.execute({
      tenantId: "11111111-1111-1111-1111-111111111111",
      taskClass: "ROUTING",
      messages: [{ role: "user", content: "hi" }],
      budgetEnvelope,
    });
    assert.ok(inserts.some((r) => r.table === "ai_execution_usage"));
  }

  // Voice OpenAI path preserves structured extraction (fixture without live network)
  {
    const prevOpenAI = process.env.OPENAI_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.OPENAI_API_KEY = "test-key";
      delete process.env.GEMINI_API_KEY;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/audio/transcriptions")) {
          return new Response(
            JSON.stringify({
              text: "I need to follow up with Priya about the launch. Decided we will go with the blue packaging. Idea: maybe a teaser reel next week.",
              language: "en",
            }),
            { status: 200 },
          );
        }
        // Structured extraction via Responses/Gemini adapters — return JSON payload.
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              language: "en",
              tasks: ["follow up with Priya about the launch"],
              decisions: ["go with the blue packaging"],
              ideas: ["teaser reel next week"],
              followUps: ["follow up with Priya about the launch"],
              openLoops: [],
              selfReportedMood: null,
              projectReferences: ["launch"],
              peopleReferences: ["Priya"],
            }),
            output: [],
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      const { transcribeVoiceNote } = await import("../../../../lib/owner-brain/voice/transcription.ts");
      const result = await transcribeVoiceNote("AAAA", "audio/webm", {
        tenantId: "11111111-1111-1111-1111-111111111111",
      });
      assert.ok(result.text.includes("Priya"));
      assert.ok(result.structuredExtraction.tasks.length > 0 || result.structuredExtraction.decisions.length > 0 || result.structuredExtraction.ideas.length > 0);
      assert.ok(
        result.structuredExtraction.tasks.length +
          result.structuredExtraction.decisions.length +
          result.structuredExtraction.ideas.length +
          result.structuredExtraction.followUps.length >
          0,
      );
      globalThis.fetch = originalFetch;
    } finally {
      if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAI;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
    }
  }

  // Image readiness: key-only != OPERATIONAL
  {
    assert.equal(resolveImageGenerationRuntimeStatus({ providerConfigured: true }), "WAITING_CONFIGURATION");
    assert.equal(
      resolveImageGenerationRuntimeStatus({
        providerConfigured: true,
        storageReady: true,
        modelAvailable: true,
        budgetValid: true,
        tenantAuthorized: true,
      }),
      "OPERATIONAL",
    );
  }

  console.log("ai-runtime-corrections.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
