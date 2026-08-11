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

  // --- Migration-month spend: legacy $4 + new $2 = $6; overlapping request counted once ---
  {
    const ledger = createLedgerClient({
      primaryRows: [
        {
          tenant_id: "tenant-a",
          estimated_cost_usd: 2,
          request_id: "overlap",
          success: true,
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
      legacyRows: [
        {
          tenant_id: "tenant-a",
          cost_cents: 400,
          metadata: {},
          created_at: "2026-08-05T00:00:00.000Z",
        },
        {
          tenant_id: "tenant-a",
          cost_cents: 200,
          metadata: { requestId: "overlap" },
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
    });
    const recorder = new SupabaseUsageRecorder(ledger.asServiceClient() as never);
    const resolved = await recorder.resolveMonthSpend!("tenant-a", "2026-08");
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.source, "combined");
      assert.equal(resolved.spentUsd, 6);
    }
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
    storage.persistGeneratedImage = originalPersist;
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

  // --- Media model readiness: text availability must not make media OPERATIONAL ---
  {
    const snap = await buildAiAdminHealthSnapshot({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes("gemini") || u.includes("generativelanguage")) {
          // Cheap text model ok; image/video models missing
          if (u.includes(resolveModelId("GOOGLE_CHEAP"))) {
            return new Response(JSON.stringify({ name: "ok" }), { status: 200 });
          }
          return new Response("not found", { status: 404 });
        }
        if (u.includes("openai.com")) {
          if (u.includes(resolveModelId("OPENAI_CHEAP_FALLBACK"))) {
            return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
          }
          return new Response("not found", { status: 404 });
        }
        return new Response("fail", { status: 503 });
      },
      storageReady: true,
      durableVideoStoreReady: true,
      budgetLedgerReady: true,
      serviceMeteringWriterReady: true,
    });
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-gemini";
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai";
    const snap2 = await buildAiAdminHealthSnapshot({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes(resolveModelId("GOOGLE_CHEAP")) || u.includes(resolveModelId("OPENAI_CHEAP_FALLBACK"))) {
          return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
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
    assert.ok(snap.gemini || snap2.gemini);
  }

  // --- Social text: owner auth + service writer meters ---
  {
    const ledger = createLedgerClient();
    const google = mockProvider("google", async () => ({
      text: "Here is a caption draft for your brand with enough detail and a clear call to action for followers.",
      toolCalls: [] as AIToolCall[],
      usage: usage({ estimatedCostUsd: 0.01 }),
      providerRequestId: "social-text-1",
    }));
    const { runtime, budgetEnvelope } = createTenantAIRuntime({
      tenantId: "tenant-a",
      missionId: null,
      sessionId: "11111111-1111-4111-8111-111111111111",
      plan: "growth",
      spentUsdThisMonth: 0,
      internalWriteClient: ledger.asServiceClient() as never,
      deps: { google, openai: mockProvider("openai", async () => ({ text: "", toolCalls: [], usage: usage(), providerRequestId: "o" })) },
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      missionId: null,
      department: "social",
      taskClass: "CONTENT",
      messages: [{ role: "user", content: "draft a caption" }],
      budgetEnvelope,
      metadata: { sessionId: "11111111-1111-4111-8111-111111111111" },
    });
    assert.equal(result.ok, true);
    assert.equal(ledger.primary.length, 1);
    assert.equal(ledger.primary[0]!.mission_id, null);
    assert.equal(ledger.primary[0]!.session_id, "11111111-1111-4111-8111-111111111111");
    assert.notEqual(ledger.primary[0]!.mission_id, "11111111-1111-4111-8111-111111111111");
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
        missionId: sessionUuid, // must NOT become missions FK
        candidateCount: 1,
      },
      {
        resolveCurrentTenant: async () => ({ active: { tenantId: "tenant-a" } }),
        createInternalWriteClient: () => ({}),
        resolveTenantMonthSpend: async () => ({ ok: true, spentUsd: 0 }),
        resolveTenantPlanTier: async () => "growth",
        evaluateBudgetGate: (e) => evaluateBudgetGate(e),
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
    assert.equal(recorder.entries[0]!.taskClass, "IMAGE");
    assert.equal(recorder.entries[0]!.tenantId, "tenant-a");
    assert.equal(recorder.entries[0]!.missionId, null);
    assert.equal(recorder.entries[0]!.sessionId, "sess-social");
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
