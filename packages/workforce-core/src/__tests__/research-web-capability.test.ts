// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/research-web-capability.test.ts
import assert from "node:assert/strict";
import { requestCapability } from "../capabilities/execution.ts";
import { getCapability } from "../capabilities/registry.ts";
import { resetAndBootstrapProvidersForTests } from "../providers/bootstrap.ts";
import { bindCapabilityHost, resetCapabilityHostForTests } from "../adapters/host.ts";
import { RESEARCH_WEB_PROVIDER_KEY } from "../adapters/research-web.ts";
import { RESEARCH_SERP_PROVIDER_KEY } from "../adapters/research-serp.ts";
import { getProvider } from "../providers/registry.ts";
import type { AIExecutionResult, AIWebEvidence } from "@stratxcel/ai-runtime";

function selection(): AIExecutionResult["selection"] {
  return {
    taskClass: "RESEARCH",
    department: "research",
    primaryProvider: "google",
    primaryModel: "gemini-flash",
    selectedProvider: "google",
    selectedModel: "gemini-flash",
    fallbackUsed: false,
    fallbackReason: "none",
    escalationLevel: 0,
    budgetStatus: "ok",
    estimatedCostUsd: 0.002,
  };
}

function auth(trustedTenantId: string) {
  return {
    trustedTenantId,
    approvalGranted: false,
    standingAuthorizationGranted: false,
    shadowMode: false,
    killSwitchActive: false,
    fromPlannerSnapshot: false,
  };
}

function researchRequest(
  overrides: Partial<{
    requestId: string;
    tenantId: string;
    missionId: string;
    capability: string;
    input: Record<string, unknown>;
    trustedTenantId: string;
  }> = {},
) {
  const tenantId = overrides.tenantId ?? "tenant-a";
  return {
    requestId: overrides.requestId ?? "req-research",
    tenantId,
    missionId: overrides.missionId ?? "mission-a",
    department: "research",
    role: "researcher",
    capability: overrides.capability ?? "research.web",
    inputArtifactIds: [] as string[],
    requestedAt: new Date().toISOString(),
    input: overrides.input ?? {},
    authorizationContext: auth(overrides.trustedTenantId ?? tenantId),
  };
}

async function run() {
  resetCapabilityHostForTests();
  resetAndBootstrapProvidersForTests();

  assert.equal(getCapability("research.web")?.status, "AVAILABLE");
  assert.equal(getCapability("research.serp")?.status, "NOT_CONFIGURED");
  assert.equal(getProvider(RESEARCH_WEB_PROVIDER_KEY)?.status, "IMPLEMENTED");
  assert.equal(getProvider(RESEARCH_SERP_PROVIDER_KEY)?.status, "NOT_CONFIGURED");

  const artifactStore = new Map<string, { id: string; tenantId: string; missionId: string; kind: string; metadata: Record<string, unknown> }>();
  const byKey = new Map<string, string>();

  const webEvidence: AIWebEvidence = {
    sources: [
      {
        id: "gemini_src_0",
        url: "https://docs.example.com/api",
        title: "API docs",
        provider: "google",
        searchQueries: ["example api pricing"],
      },
    ],
    citationSupports: [
      {
        text: "Public docs list rate limits at 100 rpm for the free tier.",
        sourceIds: ["gemini_src_0"],
        sourceIndices: [0],
      },
    ],
    searchQueries: ["example api pricing"],
  };

  bindCapabilityHost({
    persistMissionArtifact: async (input) => {
      if (input.tenantId !== "tenant-a") {
        return { ok: false, errorMessage: "TENANT_FORBIDDEN" };
      }
      const key = String(input.metadata.idempotencyKey ?? input.storageRef);
      const existing = byKey.get(key);
      if (existing) return { ok: true, id: existing };
      const id = `wa_${artifactStore.size + 1}`;
      artifactStore.set(id, {
        id,
        tenantId: input.tenantId,
        missionId: input.missionId,
        kind: input.kind,
        metadata: input.metadata,
      });
      byKey.set(key, id);
      return { ok: true, id };
    },
    findResearchArtifactByIdempotencyKey: async (args) => {
      const id = byKey.get(args.key);
      if (!id) return null;
      const row = artifactStore.get(id);
      if (!row) return null;
      if (row.tenantId !== args.tenantId || row.missionId !== args.missionId) return null;
      return { id: row.id, metadata: row.metadata };
    },
    getResearchAIExecutor: () => ({
      isConfigured: () => true,
      execute: async () =>
        ({
          ok: true,
          text: "Public docs list rate limits at 100 rpm for the free tier.",
          structuredOutput: {
            summary: "Public docs list rate limits at 100 rpm for the free tier.",
            claims: [
              {
                id: "c1",
                text: "Public docs list rate limits at 100 rpm for the free tier.",
                statementKind: "sourced_fact",
              },
            ],
          },
          toolCalls: [],
          webEvidence,
          provider: "google",
          model: "gemini-flash",
          reasoningLevel: "low",
          inputTokens: 11,
          cachedInputTokens: 0,
          outputTokens: 22,
          totalTokens: 33,
          latencyMs: 9,
          estimatedCostUsd: 0.002,
          attemptNumber: 1,
          fallbackUsed: false,
          fallbackReason: "none",
          qualityScore: 0.9,
          qualityDecision: "PASS",
          requestId: "r1",
          providerRequestId: "p1",
          createdAt: new Date().toISOString(),
          selection: selection(),
          attempts: [],
        }) satisfies AIExecutionResult,
    }),
  });

  // Happy path
  {
    const result = await requestCapability(
      researchRequest({
        requestId: "req-research-1",
        input: {
          question: "What are Example API public rate limits?",
          plan: "scale",
          spentUsdThisMonth: 0,
          monthlyBudgetUsd: 99999,
          requireWebEvidence: true,
          verifyTopSources: false,
          maxSources: 5,
        },
      }),
    );
    assert.equal(result.status, "SUCCEEDED");
    assert.ok(result.outputArtifactIds.length >= 2);
    for (const id of result.outputArtifactIds) {
      const row = artifactStore.get(id);
      assert.ok(row, `artifact ${id} must resolve`);
      assert.equal(row.tenantId, "tenant-a");
      assert.equal(row.missionId, "mission-a");
    }
    assert.ok(result.receipt);
  }

  // No AI provider → WAITING_CONFIGURATION
  {
    resetCapabilityHostForTests();
    bindCapabilityHost({
      persistMissionArtifact: async () => ({ ok: true, id: "x" }),
      getResearchAIExecutor: () => ({
        isConfigured: () => false,
        execute: async () => {
          throw new Error("no");
        },
      }),
    });
    resetAndBootstrapProvidersForTests();
    const result = await requestCapability(
      researchRequest({
        requestId: "req-research-2",
        input: { question: "Research local market in Raipur", maxSources: 3 },
      }),
    );
    assert.ok(result.status === "WAITING_CONFIGURATION" || result.status === "FAILED");
    assert.deepEqual(result.outputArtifactIds, []);
  }

  // Budget exhausted → BLOCKED before fake success artifacts
  {
    resetCapabilityHostForTests();
    bindCapabilityHost({
      persistMissionArtifact: async () => ({ ok: true, id: "should-not" }),
      getResearchAIExecutor: () => ({
        isConfigured: () => true,
        execute: async () =>
          ({
            ok: false,
            text: "",
            toolCalls: [],
            provider: null,
            model: null,
            reasoningLevel: "none",
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            latencyMs: 0,
            estimatedCostUsd: 0,
            attemptNumber: 0,
            fallbackUsed: false,
            fallbackReason: "none",
            qualityScore: null,
            qualityDecision: "SKIP",
            requestId: "r",
            providerRequestId: null,
            createdAt: new Date().toISOString(),
            selection: { ...selection(), budgetStatus: "exhausted_100" },
            attempts: [],
            errorCategory: "BUDGET_EXHAUSTED",
            userSafeError: "Usage limit reached",
          }) satisfies AIExecutionResult,
      }),
    });
    resetAndBootstrapProvidersForTests();
    const result = await requestCapability(
      researchRequest({
        requestId: "req-research-3",
        input: {
          question: "Research competitor offers publicly",
          plan: "scale",
          monthlyBudgetUsd: 999999,
          spentUsdThisMonth: 0,
          maxSources: 3,
        },
      }),
    );
    assert.ok(result.status === "BLOCKED" || result.status === "FAILED");
    assert.deepEqual(result.outputArtifactIds, []);
  }

  // Ledger unavailable / unresolved budget must fail closed, no provider output.
  {
    resetCapabilityHostForTests();
    bindCapabilityHost({
      persistMissionArtifact: async () => ({ ok: true, id: "should-not" }),
      getResearchAIExecutor: () => ({
        isConfigured: () => true,
        execute: async () => {
          throw new Error("research_month_spend_ledger_unavailable");
        },
      }),
    });
    resetAndBootstrapProvidersForTests();
    const result = await requestCapability(
      researchRequest({
        requestId: "req-research-ledger-fail",
        input: {
          question: "Research with budget authority",
          plan: "scale",
          spentUsdThisMonth: 0,
          monthlyBudgetUsd: 99999,
        },
      }),
    );
    assert.ok(result.status === "WAITING_CONFIGURATION" || result.status === "FAILED");
    assert.deepEqual(result.outputArtifactIds, []);
  }

  // Mission / tenant mismatch blocked
  {
    resetCapabilityHostForTests();
    bindCapabilityHost({
      persistMissionArtifact: async () => ({ ok: true, id: "x" }),
      getResearchAIExecutor: () => ({
        isConfigured: () => true,
        execute: async () => {
          throw new Error("should not run");
        },
      }),
    });
    resetAndBootstrapProvidersForTests();
    const result = await requestCapability(
      researchRequest({
        requestId: "req-research-4",
        input: { question: "cross tenant attempt", maxSources: 3 },
        trustedTenantId: "tenant-b",
      }),
    );
    assert.equal(result.status, "BLOCKED");
  }

  // research.serp remains NOT_CONFIGURED
  {
    resetCapabilityHostForTests();
    resetAndBootstrapProvidersForTests();
    const result = await requestCapability(
      researchRequest({
        requestId: "req-serp-1",
        capability: "research.serp",
        input: {},
      }),
    );
    assert.ok(
      result.status === "WAITING_CONFIGURATION" ||
        result.status === "WAITING_INTEGRATION" ||
        result.status === "BLOCKED",
    );
    assert.deepEqual(result.outputArtifactIds, []);
  }

  console.log("research-web-capability.test.ts: PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
