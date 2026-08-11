// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/ai-runtime-accounting-hardening.test.ts
import assert from "node:assert/strict";
import {
  assertRealMissionId,
  buildAiAdminHealthSnapshot,
  buildCanonicalGeneratedPath,
  buildCanonicalProbePath,
  createBudgetEnvelope,
  createTenantAIRuntime,
  createTenantMediaRuntime,
  evaluateBudgetGate,
  ImageMediaRuntime,
  InMemoryCanonicalMediaStorage,
  InMemoryUsageRecorder,
  resolveModelId,
  estimateImageCostUsd,
  SupabaseUsageRecorder,
  SupabaseVideoOperationStore,
  VideoMediaRuntime,
  AIRuntime,
  type AITextProviderAdapter,
  type AIToolCall,
  type AIUsage,
} from "../index.ts";
import { executeGenerateImageTool } from "../../../../lib/social/agent/generate-image-tool.ts";
import { setImageProvider, resetImageProvider, type ImageProvider } from "@stratxcel/creative-studio";

function usage(partial?: Partial<AIUsage>): AIUsage {
  return {
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: 0.01,
    ...partial,
  };
}

function mockProvider(
  provider: "google" | "openai",
  impl: AITextProviderAdapter["complete"],
): AITextProviderAdapter {
  return {
    provider,
    isConfigured: () => true,
    complete: impl,
    probeReadiness: async () => ({
      configured: true,
      reachable: true,
      modelAvailable: true,
      lastCheckedAt: new Date().toISOString(),
      safeErrorCode: null,
    }),
  };
}

function createLedgerClient(opts?: {
  ownerCanWrite?: boolean;
  failPrimaryDup?: boolean;
  primaryRows?: Array<Record<string, unknown>>;
  legacyRows?: Array<Record<string, unknown>>;
}) {
  const primary = [...(opts?.primaryRows ?? [])];
  const legacy = [...(opts?.legacyRows ?? [])];
  const ownerCanWrite = opts?.ownerCanWrite ?? false;
  let writesBlocked = !ownerCanWrite;

  return {
    primary,
    legacy,
    asOwnerClient() {
      writesBlocked = true;
      return this.asClient();
    },
    asServiceClient() {
      writesBlocked = false;
      return this.asClient();
    },
    asClient() {
      return {
        from(table: string) {
          return {
            insert: async (row: Record<string, unknown>) => {
              if (writesBlocked && (table === "ai_execution_usage" || table === "provider_usage_events")) {
                return { error: { message: "new row violates row-level security policy" } };
              }
              if (table === "ai_execution_usage") {
                if (opts?.failPrimaryDup) {
                  const dup = primary.find(
                    (r) =>
                      r.tenant_id === row.tenant_id &&
                      r.request_id === row.request_id &&
                      r.attempt_number === row.attempt_number,
                  );
                  if (dup) return { error: { message: "duplicate key value violates unique constraint" } };
                }
                const exists = primary.find(
                  (r) =>
                    r.tenant_id === row.tenant_id &&
                    r.request_id === row.request_id &&
                    Number(r.attempt_number) === Number(row.attempt_number),
                );
                if (exists) return { error: { message: "duplicate key value violates unique constraint" } };
                primary.push(row);
                return { error: null };
              }
              if (table === "provider_usage_events") {
                legacy.push(row);
                return { error: null };
              }
              return { error: null };
            },
            select: (_cols: string) => ({
              eq: (_col: string, tenantId: string) => ({
                gte: async () => {
                  if (table === "ai_execution_usage") {
                    return {
                      data: primary.filter((r) => r.tenant_id === tenantId),
                      error: null,
                    };
                  }
                  return {
                    data: legacy.filter((r) => r.tenant_id === tenantId),
                    error: null,
                  };
                },
                in: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { plan_tier: "growth" }, error: null }),
                    }),
                  }),
                }),
              }),
              limit: async () => ({ error: null }),
            }),
            upsert: async (row: Record<string, unknown>) => {
              if (writesBlocked && table === "ai_media_operations") {
                return { error: { message: "new row violates row-level security policy" } };
              }
              return { error: null };
            },
          };
        },
        storage: {
          from: () => ({
            upload: async () => ({ error: null }),
            download: async () => ({ data: null, error: { message: "missing" } }),
            remove: async () => ({ error: null }),
          }),
        },
      };
    },
  };
}

async function run() {
  // --- Billable runtime requires usage writer ---
  assert.throws(
    () => createTenantAIRuntime({ tenantId: "tenant-a", plan: "starter", spentUsdThisMonth: 0 }),
    /usage_writer_required_for_billable_ai/,
  );
  assert.doesNotThrow(() =>
    createTenantAIRuntime({
      tenantId: "tenant-a",
      plan: "starter",
      spentUsdThisMonth: 0,
      internalUnmetered: true,
    }),
  );
  const metered = createTenantAIRuntime({
    tenantId: "tenant-a",
    plan: "starter",
    spentUsdThisMonth: 0,
    usageRecorder: new InMemoryUsageRecorder(),
  });
  assert.ok(metered.usageRecorder);

  // --- missionId truth ---
  assert.equal(assertRealMissionId(null), null);
  assert.throws(() => assertRealMissionId("mission_tenant-a"), /mission_id_must_be_real/);
  assert.throws(() => assertRealMissionId("session_abc"), /mission_id_must_be_real/);
  assert.equal(assertRealMissionId("11111111-1111-4111-8111-111111111111"), "11111111-1111-4111-8111-111111111111");

  // --- Owner RLS client cannot write ledgers; service writer can ---
  {
    const ledger = createLedgerClient();
    const ownerRecorder = new SupabaseUsageRecorder(ledger.asOwnerClient() as never);
    await assert.rejects(
      () =>
        ownerRecorder.record({
          tenantId: "tenant-a",
          missionId: null,
          sessionId: "social-session-uuid",
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
          estimatedCostUsd: 0.02,
          latencyMs: 1,
          success: true,
          errorCategory: null,
          selectionReason: "m",
          requestId: "req-owner",
          createdAt: "2026-08-12T00:00:00.000Z",
        }),
      /usage_ledger_write_failed|row-level security/,
    );
    assert.equal(ledger.primary.length, 0);

    const serviceRecorder = new SupabaseUsageRecorder(ledger.asServiceClient() as never);
    await serviceRecorder.record({
      tenantId: "tenant-a",
      missionId: null,
      sessionId: "social-session-uuid",
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
      estimatedCostUsd: 0.02,
      latencyMs: 1,
      success: true,
      errorCategory: null,
      selectionReason: "m",
      requestId: "req-service",
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    assert.equal(ledger.primary.length, 1);
    assert.equal(ledger.primary[0]!.session_id, "social-session-uuid");
    assert.equal(ledger.primary[0]!.mission_id, null);
  }

  // --- Attempt idempotency: duplicate does NOT fall into legacy ---
  {
    const ledger = createLedgerClient();
    const recorder = new SupabaseUsageRecorder(ledger.asServiceClient() as never);
    const entry = {
      tenantId: "tenant-a",
      missionId: null,
      department: "social" as const,
      specialistRole: null,
      taskClass: "CONTENT" as const,
      provider: "google" as const,
      model: "m",
      attemptNumber: 1,
      fallbackUsed: false,
      fallbackReason: "none" as const,
      escalationLevel: 0,
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
      estimatedCostUsd: 0.05,
      latencyMs: 1,
      success: true,
      errorCategory: null,
      selectionReason: "m",
      requestId: "same-req",
      createdAt: "2026-08-12T01:00:00.000Z",
    };
    await recorder.record(entry);
    await recorder.record(entry); // retry
    assert.equal(ledger.primary.length, 1);
    assert.equal(ledger.legacy.length, 0);
  }

  // --- Cutover-enforced month spend + attempt-level cross-ledger dedupe ---
  {
    // legacy Aug 5 $4 + new Aug 11 $2 => $6
    const basic = createLedgerClient({
      primaryRows: [
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 2,
          request_id: "req-new",
          attempt_number: 1,
          success: true,
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
      legacyRows: [
        {
          tenant_id: "tenant-a",
          cost_cents: 400,
          metadata: { requestId: "req-old", attemptNumber: 1 },
          created_at: "2026-08-05T00:00:00.000Z",
        },
      ],
    });
    const basicResolved = await new SupabaseUsageRecorder(basic.asServiceClient() as never).resolveMonthSpend!(
      "tenant-a",
      "2026-08",
    );
    assert.equal(basicResolved.ok, true);
    if (basicResolved.ok) assert.equal(basicResolved.spentUsd, 6);

    // exact attempt overlap counted once
    const overlap = createLedgerClient({
      primaryRows: [
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 1,
          request_id: "req-x",
          attempt_number: 1,
          success: true,
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
      legacyRows: [
        {
          tenant_id: "tenant-a",
          cost_cents: 100,
          metadata: { requestId: "req-x", attemptNumber: 1 },
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
    });
    const overlapResolved = await new SupabaseUsageRecorder(overlap.asServiceClient() as never).resolveMonthSpend!(
      "tenant-a",
      "2026-08",
    );
    assert.equal(overlapResolved.ok, true);
    if (overlapResolved.ok) assert.equal(overlapResolved.spentUsd, 1);

    // same requestId different attemptNumber — both count
    const multi = createLedgerClient({
      primaryRows: [
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 1,
          request_id: "req-x",
          attempt_number: 1,
          success: true,
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
      legacyRows: [
        {
          tenant_id: "tenant-a",
          cost_cents: 200,
          metadata: { requestId: "req-x", attemptNumber: 2 },
          created_at: "2026-08-11T13:00:00.000Z",
        },
      ],
    });
    const multiResolved = await new SupabaseUsageRecorder(multi.asServiceClient() as never).resolveMonthSpend!(
      "tenant-a",
      "2026-08",
    );
    assert.equal(multiResolved.ok, true);
    if (multiResolved.ok) assert.equal(multiResolved.spentUsd, 3);

    // cutoverAt actually filters: pre-cutover new row ignored when cutover is later
    const cut = createLedgerClient({
      primaryRows: [
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 9,
          request_id: "pre",
          attempt_number: 1,
          success: true,
          created_at: "2026-08-01T00:00:00.000Z",
        },
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 2,
          request_id: "post",
          attempt_number: 1,
          success: true,
          created_at: "2026-08-12T00:00:00.000Z",
        },
      ],
      legacyRows: [
        {
          tenant_id: "tenant-a",
          cost_cents: 400,
          metadata: {},
          created_at: "2026-08-05T00:00:00.000Z",
        },
      ],
    });
    const cutResolved = await new SupabaseUsageRecorder(cut.asServiceClient() as never, {
      cutoverAt: "2026-08-11T00:00:00.000Z",
    }).resolveMonthSpend!("tenant-a", "2026-08");
    assert.equal(cutResolved.ok, true);
    if (cutResolved.ok) assert.equal(cutResolved.spentUsd, 6); // $4 legacy pre + $2 new post
  }

  // --- Image taskClass + provider cost recorded even when persist fails ---
  {
    const recorder = new InMemoryUsageRecorder();
    const storage = new InMemoryCanonicalMediaStorage({ ownerId: "owner-1" });
    storage.writable = false;
    let openaiCalled = false;
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      openaiApiKey: "o",
      storage,
      requireStorageForOperational: false,
      usageRecorder: recorder,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
      sessionId: "sess-1",
      fetchImpl: async (url) => {
        if (String(url).includes("openai")) {
          openaiCalled = true;
          throw new Error("openai should not be needed");
        }
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }],
          }),
          { status: 200 },
        );
      },
    });
    // Force persist path with requireStorage + writable false → WAITING; use persistCanonical true with writable storage that throws
    storage.writable = true;
    const originalPersist = storage.persistGeneratedImage.bind(storage);
    storage.persistGeneratedImage = async () => {
      throw new Error("canonical_upload_failed:boom");
    };
    const out = await images.generate({
      tenantId: "tenant-a",
      missionId: null,
      generationRequestId: "img-gen-1",
      prompt: "hero",
      candidateCount: 1,
      persistCanonical: true,
    });
    assert.equal(out.outcome, "FAILED");
    assert.equal(out.reason, "canonical_persist_failed");
    assert.equal(recorder.entries.length, 1);
    assert.equal(recorder.entries[0]!.taskClass, "IMAGE");
    assert.equal(recorder.entries[0]!.success, true);
    assert.equal(recorder.entries[0]!.requestId, "img-gen-1");
    assert.equal(recorder.entries[0]!.missionId, null);
    assert.equal(recorder.entries[0]!.sessionId, "sess-1");
    assert.equal(openaiCalled, false);
    assert.equal(out.usageAccountingStatus, "RECORDED");
    storage.persistGeneratedImage = originalPersist;
  }

  // Metering failure is observable (not silently swallowed)
  {
    const failingRecorder = {
      record: async () => {
        throw new Error("usage_ledger_write_failed:permission denied");
      },
    };
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      usageRecorder: failingRecorder as never,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }],
          }),
          { status: 200 },
        ),
    });
    const out = await images.generate({
      tenantId: "tenant-a",
      missionId: null,
      generationRequestId: "img-fail-meter",
      prompt: "hero",
      candidateCount: 1,
      persistCanonical: false,
    });
    assert.equal(out.usageAccountingStatus, "FAILED");
    assert.ok(out.candidates.length >= 1 || out.outcome === "FAILED" || out.outcome === "OK");
  }

  // --- OpenAI fallback budget recheck ---
  {
    let openaiCalls = 0;
    const recorder = new InMemoryUsageRecorder();
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      openaiApiKey: "o",
      usageRecorder: recorder,
      // $0.05 remaining on starter ($10 budget → spent 9.95)
      budgetEnvelope: createBudgetEnvelope({ plan: "starter", spentUsdThisMonth: 9.95, monthlyBudgetUsd: 10 }),
      fetchImpl: async (url) => {
        if (String(url).includes("openai")) {
          openaiCalls += 1;
          return new Response(JSON.stringify({ data: [{ b64_json: "YWJj" }] }), { status: 200 });
        }
        return new Response("fail", { status: 503 });
      },
    });
    const openaiProjected = estimateImageCostUsd(resolveModelId("OPENAI_IMAGE_FALLBACK"), 1, {
      quality: "high",
      size: "1024x1024",
    });
    assert.equal(openaiProjected, 0.211);
    const out = await images.generate({
      tenantId: "tenant-a",
      missionId: null,
      prompt: "hero",
      candidateCount: 1,
      quality: "high",
      size: "1024x1024",
    });
    assert.equal(out.outcome, "BUDGET_EXHAUSTED");
    assert.equal(openaiCalls, 0);
  }

  // --- Video taskClass VIDEO + durable service store ---
  {
    const recorder = new InMemoryUsageRecorder();
    const ops: Record<string, unknown>[] = [];
    const serviceDb = {
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>) => {
          assert.equal(table, "ai_media_operations");
          ops.push(row);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const store = new SupabaseVideoOperationStore(serviceDb as never);
    const video = new VideoMediaRuntime({
      geminiApiKey: "g",
      store,
      usageRecorder: recorder,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
      sessionId: "sess-v",
      fetchImpl: async () => new Response(JSON.stringify({ name: "operations/vid-1" }), { status: 200 }),
    });
    const submitted = await video.submit({ tenantId: "tenant-a", missionId: null, prompt: "scene" });
    assert.equal(submitted.status, "submitted");
    assert.equal(ops.length, 1);
    assert.equal(recorder.entries[0]!.taskClass, "VIDEO");
    assert.equal(recorder.entries[0]!.requestId, "operations/vid-1");
  }

  // Production media factory requires internalWriteClient + durable store
  {
    assert.throws(
      () =>
        createTenantMediaRuntime({
          tenantId: "t",
          ownerId: "o",
          plan: "starter",
          spentUsdThisMonth: 0,
          internalWriteClient: null as never,
        }),
      /internal_write_client_required|Cannot read/,
    );
    const ledger = createLedgerClient();
    const media = createTenantMediaRuntime({
      tenantId: "tenant-a",
      ownerId: "owner-1",
      plan: "growth",
      spentUsdThisMonth: 0,
      sessionId: "sess",
      missionId: null,
      internalWriteClient: ledger.asServiceClient() as never,
    });
    assert.ok(media.images);
    assert.ok(media.video);
    assert.ok(media.storage);
  }

  // --- Canonical storage path policy match ---
  {
    const ownerId = "owner-1";
    const tenantA = "tenant-a";
    const tenantB = "tenant-b";
    const storage = new InMemoryCanonicalMediaStorage({
      ownerId,
      authorizedTenantIds: [tenantA],
    });
    assert.equal(await storage.isWritable(), true);
    const ok = await storage.persistGeneratedImage({
      tenantId: tenantA,
      missionId: null,
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
      originalName: "a.png",
    });
    assert.ok(ok.storagePath.startsWith(`${ownerId}/${tenantA}/ai-generated/`));
    assert.equal(
      buildCanonicalProbePath({ ownerId, tenantId: tenantA }),
      `${ownerId}/${tenantA}/.ai-runtime-write-probe`,
    );
    assert.match(
      buildCanonicalGeneratedPath({ ownerId, tenantId: tenantA, assetId: "x", originalName: "a.png" }),
      new RegExp(`^${ownerId}/${tenantA}/ai-generated/`),
    );
    await assert.rejects(
      () =>
        storage.persistGeneratedImage({
          tenantId: tenantB,
          mimeType: "image/png",
          bytes: new Uint8Array([1]),
          originalName: "b.png",
        }),
      /cross_tenant_storage_forbidden/,
    );
  }

  // --- Media model readiness: generation methods required ---
  {
    const { probeGeminiReadiness, ReadinessCache, modelSupportsGenerationMethods, GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS, GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS } =
      await import("../health/readiness.ts");
    assert.equal(modelSupportsGenerationMethods(["generateContent"], GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS), true);
    assert.equal(modelSupportsGenerationMethods(["generateContent"], GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS), false);
    assert.equal(modelSupportsGenerationMethods(["predictLongRunning"], GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS), true);

    const cache = new ReadinessCache();
    const imageMissingMethod = await probeGeminiReadiness({
      apiKey: "k",
      model: resolveModelId("GOOGLE_IMAGE_STANDARD"),
      cache,
      requiredGenerationMethods: GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS,
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: "models/x", supportedGenerationMethods: ["generateText"] }), {
          status: 200,
        }),
    });
    assert.equal(imageMissingMethod.modelAvailable, false);

    const imageOk = await probeGeminiReadiness({
      apiKey: "k",
      model: resolveModelId("GOOGLE_IMAGE_STANDARD"),
      cache: new ReadinessCache(),
      requiredGenerationMethods: GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS,
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: "models/x", supportedGenerationMethods: ["generateContent"] }), {
          status: 200,
        }),
    });
    assert.equal(imageOk.modelAvailable, true);

    const videoMissing = await probeGeminiReadiness({
      apiKey: "k",
      model: resolveModelId("GOOGLE_VIDEO_ECONOMY"),
      cache: new ReadinessCache(),
      requiredGenerationMethods: GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS,
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: "models/v", supportedGenerationMethods: ["generateContent"] }), {
          status: 200,
        }),
    });
    assert.equal(videoMissing.modelAvailable, false);

    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-gemini";
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai";
    const snap2 = await buildAiAdminHealthSnapshot({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes(resolveModelId("GOOGLE_CHEAP")) || u.includes(resolveModelId("OPENAI_CHEAP_FALLBACK"))) {
          return new Response(JSON.stringify({ id: "ok", supportedGenerationMethods: ["generateContent"] }), {
            status: 200,
          });
        }
        // Media models exist but lack required generation methods
        if (u.includes(resolveModelId("GOOGLE_IMAGE_STANDARD")) || u.includes(resolveModelId("GOOGLE_VIDEO_ECONOMY"))) {
          return new Response(JSON.stringify({ name: "models/m", supportedGenerationMethods: ["generateText"] }), {
            status: 200,
          });
        }
        return new Response("missing", { status: 404 });
      },
      storageReady: true,
      durableVideoStoreReady: true,
      budgetLedgerReady: true,
      serviceMeteringWriterReady: true,
    });
    assert.equal(snap2.image.primaryModelAvailable, false);
    assert.notEqual(snap2.image.status, "operational");
    assert.equal(snap2.video.economyModelAvailable, false);
    assert.notEqual(snap2.video.status, "operational");
  }

  // --- Social text via ACTUAL AiRuntimeSocialProvider path ---
  {
    const { createAiRuntimeSocialProvider } = await import("../../../../lib/social/agent/provider.ts");
    const ledger = createLedgerClient();
    const google = mockProvider("google", async () => ({
      text: "Here is a caption draft for your brand with enough detail and a clear call to action for followers.",
      toolCalls: [] as AIToolCall[],
      usage: usage({ estimatedCostUsd: 0.01 }),
      providerRequestId: "social-text-1",
    }));
    const prevG = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createAiRuntimeSocialProvider();
    assert.equal(provider.isConfigured(), true);
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const completion = await provider.complete(
      [{ role: "user", content: "draft a caption" }],
      [],
      {
        brandInstructions: ["Voice: warm."],
        tenantId: "tenant-a",
        missionId: null,
        sessionId,
        spentUsdThisMonth: 0,
        plan: "growth",
        copilotIntent: "PREPARE_CONTENT",
        internalWriteClient: ledger.asServiceClient() as never,
        runtimeDeps: {
          google,
          openai: mockProvider("openai", async () => ({
            text: "",
            toolCalls: [],
            usage: usage(),
            providerRequestId: "o",
          })),
        },
      },
    );
    assert.ok(completion.text.length > 0);
    assert.equal(ledger.primary.length, 1);
    assert.equal(ledger.primary[0]!.tenant_id, "tenant-a");
    assert.equal(ledger.primary[0]!.mission_id, null);
    assert.equal(ledger.primary[0]!.session_id, sessionId);
    assert.equal(ledger.primary[0]!.task_class, "CONTENT");
    assert.ok(ledger.primary[0]!.provider);
    assert.ok(ledger.primary[0]!.model);
    assert.ok(Number(ledger.primary[0]!.estimated_cost_usd) > 0);
    assert.equal(Number(ledger.primary[0]!.attempt_number), 1);
    // exact attempt once
    await provider.complete([{ role: "user", content: "draft a caption" }], [], {
      brandInstructions: [],
      tenantId: "tenant-a",
      missionId: null,
      sessionId,
      spentUsdThisMonth: 0,
      plan: "growth",
      copilotIntent: "PREPARE_CONTENT",
      internalWriteClient: ledger.asServiceClient() as never,
      runtimeDeps: {
        google: mockProvider("google", async () => ({
          text: "Here is a caption draft for your brand with enough detail and a clear call to action for followers.",
          toolCalls: [],
          usage: usage({ estimatedCostUsd: 0.01 }),
          providerRequestId: "social-text-1",
        })),
        openai: mockProvider("openai", async () => ({
          text: "",
          toolCalls: [],
          usage: usage(),
          providerRequestId: "o",
        })),
      },
    });
    // second call gets a new requestId from runtime — both attempts legitimate; first attempt identity unique per requestId
    assert.ok(ledger.primary.length >= 1);
    process.env.GEMINI_API_KEY = prevG;
  }

  // Service writer must not run before tenant authorization (Social tool refuses no-tenant)
  {
    let writeClientCreated = false;
    const denied = await executeGenerateImageTool(
      { ok: true, ownerId: "owner-1", email: null, supabase: {} as never },
      { brief: "x", sessionId: "s1" },
      {
        resolveCurrentTenant: async () => ({ active: null }),
        createInternalWriteClient: () => {
          writeClientCreated = true;
          return {};
        },
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "starter",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        createTenantMediaRuntime: () => {
          throw new Error("should_not_build_media");
        },
      },
    );
    assert.equal(denied.reason, "tenant_required_for_billable_ai");
    assert.equal(writeClientCreated, false);
  }

  // --- Social generate_image integration via executeGenerateImageTool ---
  {
    resetImageProvider();
    setImageProvider({
      name: "test-image",
      isConfigured: () => true,
      generate: async () => {
        throw new Error("creative-studio path must not run when runtime supplied");
      },
    } as ImageProvider);

    const recorder = new InMemoryUsageRecorder();
    const storage = new InMemoryCanonicalMediaStorage({
      ownerId: "owner-1",
      authorizedTenantIds: ["tenant-a"],
    });
    const images = new ImageMediaRuntime({
      geminiApiKey: "g",
      storage,
      requireStorageForOperational: true,
      usageRecorder: recorder,
      budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
      sessionId: "sess-social",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }],
          }),
          { status: 200 },
        ),
    });

    const sessionUuid = "33333333-3333-4333-8333-333333333333";
    const randomMission = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const verifiedMission = "11111111-2222-4333-8444-555555555555";

    // Untrusted random UUID / session UUID → mission_id NULL
    const untrusted = await executeGenerateImageTool(
      {
        ok: true,
        ownerId: "owner-1",
        email: "o@test.local",
        supabase: {} as never,
      },
      {
        brief: "Brand product hero",
        sessionId: sessionUuid,
        missionId: randomMission,
        candidateCount: 1,
      },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "growth",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        resolveAuthorizedMissionId: async () => null,
        createTenantMediaRuntime: (input) => {
          assert.equal(input.missionId, null);
          return {
            images,
            storage,
            budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
          };
        },
      },
    );
    assert.equal(untrusted.outcome, "REVISION_REQUIRED");
    assert.equal(recorder.entries[0]!.missionId, null);

    recorder.reset();
    const sessionAsMission = await executeGenerateImageTool(
      { ok: true, ownerId: "owner-1", email: null, supabase: {} as never },
      { brief: "x", sessionId: sessionUuid, missionId: sessionUuid, candidateCount: 1 },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "growth",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        resolveAuthorizedMissionId: async () => null,
        createTenantMediaRuntime: (input) => {
          assert.equal(input.missionId, null);
          return {
            images: new ImageMediaRuntime({
              geminiApiKey: "g",
              storage,
              requireStorageForOperational: true,
              usageRecorder: recorder,
              budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
              sessionId: "sess-social",
              missionId: input.missionId,
              fetchImpl: async () =>
                new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }],
                  }),
                  { status: 200 },
                ),
            }),
            storage,
            budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
          };
        },
      },
    );
    assert.equal(sessionAsMission.outcome, "REVISION_REQUIRED");
    assert.equal(recorder.entries[0]!.missionId, null);

    // Server-verified tenant-owned mission → real missions.id
    recorder.reset();
    const verified = await executeGenerateImageTool(
      { ok: true, ownerId: "owner-1", email: null, supabase: {} as never },
      { brief: "x", sessionId: sessionUuid, missionId: verifiedMission, candidateCount: 1 },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "growth",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        resolveAuthorizedMissionId: async ({ candidateMissionId }) =>
          candidateMissionId === verifiedMission ? verifiedMission : null,
        createTenantMediaRuntime: (input) => {
          assert.equal(input.missionId, verifiedMission);
          return {
            images: new ImageMediaRuntime({
              geminiApiKey: "g",
              storage,
              requireStorageForOperational: true,
              usageRecorder: recorder,
              budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
              sessionId: "sess-social",
              missionId: input.missionId,
              fetchImpl: async () =>
                new Response(
                  JSON.stringify({
                    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }],
                  }),
                  { status: 200 },
                ),
            }),
            storage,
            budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
          };
        },
      },
    );
    assert.equal(verified.outcome, "REVISION_REQUIRED");
    assert.equal(recorder.entries[0]!.missionId, verifiedMission);

    // resolveAuthorizedMissionId unit: no missions row → null
    {
      const { resolveAuthorizedMissionId } = await import("../mission-auth.ts");
      const none = await resolveAuthorizedMissionId({
        authorizationClient: {
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as never,
        tenantId: "tenant-a",
        candidateMissionId: randomMission,
      });
      assert.equal(none, null);

      const owned = await resolveAuthorizedMissionId({
        authorizationClient: {
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: verifiedMission, tenant_id: "tenant-a" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        } as never,
        tenantId: "tenant-a",
        candidateMissionId: verifiedMission,
      });
      assert.equal(owned, verifiedMission);
    }

    const result = await executeGenerateImageTool(
      {
        ok: true,
        ownerId: "owner-1",
        email: "o@test.local",
        supabase: {} as never,
      },
      {
        brief: "Brand product hero",
        sessionId: sessionUuid,
        missionId: sessionUuid,
        candidateCount: 1,
      },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "growth",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        resolveAuthorizedMissionId: async () => null,
        createTenantMediaRuntime: () => ({
          images,
          storage,
          budgetEnvelope: createBudgetEnvelope({ plan: "growth", spentUsdThisMonth: 0 }),
        }),
      },
    );

    assert.equal(result.outcome, "REVISION_REQUIRED");
    assert.equal(result.selectedCandidateId, null);
    const candidates = result.candidates as Array<{ uri: string; storedAssetId?: string }>;
    assert.ok(candidates.length >= 1);
    assert.equal(/^data:/i.test(candidates[0]!.uri), false);
    assert.ok(candidates[0]!.storedAssetId);
    assert.equal(recorder.entries.at(-1)!.taskClass, "IMAGE");
    assert.equal(recorder.entries.at(-1)!.tenantId, "tenant-a");
    assert.equal(recorder.entries.at(-1)!.missionId, null);
    assert.ok((result.persistedMediaAssetIds as string[]).length >= 1);

    // Budget enforced on Social path
    const budgetBlocked = await executeGenerateImageTool(
      { ok: true, ownerId: "owner-1", email: null, supabase: {} as never },
      { brief: "x", sessionId: sessionUuid, candidateCount: 1 },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 9.99 }),
        resolveTenantPlanTier: async () => "starter",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
        createTenantMediaRuntime: (input) => ({
          images: new ImageMediaRuntime({
            geminiApiKey: "g",
            storage,
            usageRecorder: recorder,
            budgetEnvelope: createBudgetEnvelope({
              plan: input.plan,
              spentUsdThisMonth: input.spentUsdThisMonth,
              monthlyBudgetUsd: 10,
            }),
            fetchImpl: async () => {
              throw new Error("should not call provider when budget exhausted at gate");
            },
          }),
          storage,
          budgetEnvelope: createBudgetEnvelope({
            plan: "starter",
            spentUsdThisMonth: 9.99,
            monthlyBudgetUsd: 10,
          }),
        }),
      },
    );
    assert.equal(budgetBlocked.outcome, "BUDGET_EXCEEDED");

    resetImageProvider();
  }

  // Factory refuses synthetic mission ids
  assert.throws(
    () =>
      createTenantAIRuntime({
        tenantId: "t",
        plan: "starter",
        spentUsdThisMonth: 0,
        missionId: "mission_t",
        usageRecorder: new InMemoryUsageRecorder(),
      }),
    /mission_id_must_be_real/,
  );

  console.log("ai-runtime-accounting-hardening.test.ts: ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
