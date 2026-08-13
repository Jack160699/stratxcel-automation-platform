// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/web-evidence.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AIRuntime,
  InMemoryUsageRecorder,
  GeminiTextProvider,
  OpenAITextProvider,
  parseGeminiGroundingMetadata,
  parseOpenAIWebEvidence,
  assessQuality,
  type AITextProviderAdapter,
  type AIUsage,
  type AIToolCall,
  type AIWebEvidence,
} from "../index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "fixtures");

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function usage(): AIUsage {
  return {
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 20,
    totalTokens: 30,
    estimatedCostUsd: 0.0001,
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
  // Gemini grounded parser
  {
    const fixture = loadJson("gemini-grounded.json") as {
      candidates: Array<{ groundingMetadata: unknown }>;
    };
    const evidence = parseGeminiGroundingMetadata(fixture.candidates[0]!.groundingMetadata);
    assert.equal(evidence.sources.length, 2);
    assert.equal(evidence.searchQueries.length, 2);
    assert.equal(evidence.citationSupports.length, 2);
    assert.ok(evidence.sources[0]!.url.startsWith("https://"));
    assert.equal(evidence.searchAttribution?.hasSearchEntryPoint, true);
    assert.ok((evidence.searchAttribution?.renderedContentLength ?? 0) > 0);
  }

  // Gemini no grounding
  {
    const fixture = loadJson("gemini-no-grounding.json") as {
      candidates: Array<{ groundingMetadata?: unknown }>;
    };
    const evidence = parseGeminiGroundingMetadata(fixture.candidates[0]?.groundingMetadata);
    assert.equal(evidence.sources.length, 0);
  }

  // Gemini chunk index integrity with skipped middle chunk.
  {
    const evidence = parseGeminiGroundingMetadata({
      groundingChunks: [
        { web: { uri: "https://a.example/1", title: "A1" } },
        { web: { uri: "javascript:alert(1)", title: "bad" } },
        { web: { uri: "https://a.example/2", title: "A2" } },
      ],
      groundingSupports: [
        { segment: { text: "From chunk2" }, groundingChunkIndices: [2] },
      ],
    });
    assert.equal(evidence.sources.length, 2);
    assert.equal(evidence.citationSupports.length, 1);
    assert.deepEqual(evidence.citationSupports[0]?.sourceIds, ["gemini_src_2"]);
  }

  // Malformed — no invented URLs, no crash
  {
    const fixture = loadJson("gemini-malformed-grounding.json") as {
      candidates: Array<{ groundingMetadata: unknown }>;
    };
    const evidence = parseGeminiGroundingMetadata(fixture.candidates[0]!.groundingMetadata);
    assert.equal(evidence.sources.length, 0);
    assert.equal(evidence.citationSupports.length, 0);
  }

  // OpenAI web search
  {
    const fixture = loadJson("openai-web-search.json") as Parameters<typeof parseOpenAIWebEvidence>[0];
    const evidence = parseOpenAIWebEvidence(fixture);
    assert.ok(evidence.sources.length >= 2);
    assert.ok(evidence.citationSupports.length >= 2);
    assert.ok(evidence.searchQueries.includes("latest news about AI"));
  }

  // OpenAI no citation
  {
    const fixture = loadJson("openai-no-citation.json") as Parameters<typeof parseOpenAIWebEvidence>[0];
    const evidence = parseOpenAIWebEvidence(fixture);
    assert.equal(evidence.sources.length, 0);
  }

  // OpenAI current web_search_call shape: queries[] + legacy query + sources[].
  {
    const evidence = parseOpenAIWebEvidence({
      output: [
        {
          type: "web_search_call",
          action: {
            queries: ["alpha", "beta", "alpha"],
            query: "beta",
            sources: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com/a",
                  start_index: 0,
                  end_index: 5,
                },
              ],
            },
          ],
        },
      ],
    });
    assert.deepEqual(evidence.searchQueries, ["alpha", "beta"]);
    assert.ok(evidence.sources.length >= 2);
    assert.equal(evidence.citationSupports[0]?.sourceIds.length, 1);
  }

  // Gemini adapter parses grounding via fake HTTP
  {
    const body = loadJson("gemini-grounded.json");
    let capturedBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Who won Euro 2024?" }],
      reasoningLevel: "low",
      enableGoogleSearchGrounding: true,
      structuredOutputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" },
                statementKind: { type: "string" },
              },
            },
          },
        },
      },
      timeoutMs: 5_000,
    });
    assert.ok((result.webEvidence?.sources.length ?? 0) >= 2);
    assert.ok((result.usage.toolUsage?.webSearchQueries ?? 0) >= 2);
    assert.ok((result.usage.toolUsage?.estimatedToolCostUsd ?? 0) > 0);
    assert.ok(result.usage.estimatedCostUsd >= (result.usage.toolUsage?.estimatedToolCostUsd ?? 0));
    const generationConfig = capturedBody.generationConfig as Record<string, unknown>;
    assert.equal(generationConfig?.responseMimeType, "application/json");
    assert.ok(generationConfig?.responseJsonSchema);
    assert.ok(!("responseFormat" in (generationConfig ?? {})));
    const tools = capturedBody.tools as Array<Record<string, unknown>>;
    assert.ok(tools?.some((t) => Boolean(t.google_search)));
  }

  // OpenAI adapter parses citations via fake HTTP
  {
    const body = loadJson("openai-web-search.json");
    const fetchImpl = async () =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const provider = new OpenAITextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "AI news?" }],
      reasoningLevel: "low",
      enableWebSearch: true,
      timeoutMs: 5_000,
    });
    assert.ok((result.webEvidence?.sources.length ?? 0) >= 2);
    assert.ok((result.usage.toolUsage?.webSearchCalls ?? 0) >= 1);
    assert.ok((result.usage.toolUsage?.estimatedToolCostUsd ?? 0) > 0);
  }

  // INSUFFICIENT_EVIDENCE on primary tries normal OpenAI fallback before escalation.
  {
    let googleCalls = 0;
    let openaiCalls = 0;
    const google = mockProvider("google", async () => {
      googleCalls += 1;
      return {
        text: "memory only answer without sources for research question.",
        toolCalls: [] as AIToolCall[],
        usage: usage(),
        providerRequestId: "g-empty",
        webEvidence: { sources: [], citationSupports: [], searchQueries: [] },
      };
    });
    const openai = mockProvider("openai", async () => {
      openaiCalls += 1;
      return {
        text: "Example Inc was founded in 2010 according to its about page. https://example.com/about",
        toolCalls: [] as AIToolCall[],
        usage: {
          ...usage(),
          estimatedCostUsd: 0.002,
          toolUsage: {
            webSearchCalls: 1,
            estimatedToolCostUsd: 0.01,
            costEstimateKind: "upper_bound",
          },
        },
        providerRequestId: "o-ok",
        webEvidence: {
          sources: [
            {
              id: "openai_src_0",
              url: "https://example.com/about",
              title: "About",
              domain: "example.com",
              provider: "openai",
            },
          ],
          citationSupports: [
            { text: "Founded in 2010", sourceIds: ["openai_src_0"], sourceIndices: [0] },
          ],
          searchQueries: ["example founded"],
        },
      };
    });
    const runtime = new AIRuntime({
      google,
      openai,
      usageRecorder: new InMemoryUsageRecorder(),
      paidFallbackEnabled: true,
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      missionId: "11111111-1111-4111-8111-111111111111",
      department: "research",
      taskClass: "RESEARCH",
      requireWebEvidence: true,
      budgetEnvelope: {
        plan: "growth",
        monthlyBudgetUsd: 50,
        spentUsdThisMonth: 0,
      },
      messages: [{ role: "user", content: "When was Example Inc founded? Cite sources." }],
    });
    assert.equal(googleCalls, 1);
    assert.equal(openaiCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.provider, "openai");
    assert.equal(result.fallbackUsed, true);
  }

  // Fallback budget recheck includes accumulated primary cost (with tool cost).
  {
    let openaiCalls = 0;
    const google = mockProvider("google", async () => ({
      text: "memory only answer without sources for research question.",
      toolCalls: [] as AIToolCall[],
      usage: {
        ...usage(),
        estimatedCostUsd: 0.05,
        toolUsage: {
          webSearchQueries: 2,
          estimatedToolCostUsd: 0.028,
          costEstimateKind: "upper_bound",
        },
      },
      providerRequestId: "g-empty",
      webEvidence: { sources: [], citationSupports: [], searchQueries: ["a", "b"] },
    }));
    const openai = mockProvider("openai", async () => {
      openaiCalls += 1;
      throw new Error("should not call openai when budget exhausted");
    });
    const runtime = new AIRuntime({
      google,
      openai,
      usageRecorder: new InMemoryUsageRecorder(),
      paidFallbackEnabled: true,
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      missionId: "11111111-1111-4111-8111-111111111111",
      department: "research",
      taskClass: "RESEARCH",
      requireWebEvidence: true,
      budgetEnvelope: {
        plan: "starter",
        monthlyBudgetUsd: 0.06,
        spentUsdThisMonth: 0.01,
      },
      messages: [{ role: "user", content: "Research with tiny remaining budget" }],
    });
    assert.equal(openaiCalls, 0);
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "INSUFFICIENT_EVIDENCE");
  }

  // OpenAI auth failure via fake HTTP
  {
    const fetchImpl = async () =>
      new Response(JSON.stringify(loadJson("openai-auth-failure.json")), { status: 401 });
    const provider = new OpenAITextProvider({ apiKey: "test-key", fetchImpl });
    await assert.rejects(
      () =>
        provider.complete({
          model: "gpt-5-mini",
          messages: [{ role: "user", content: "hi" }],
          reasoningLevel: "none",
          timeoutMs: 5_000,
        }),
      /401|AUTH/i,
    );
  }

  // Gemini timeout
  {
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return new Response("{}");
    };
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    await assert.rejects(
      () =>
        provider.complete({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
          reasoningLevel: "none",
          timeoutMs: 20,
        }),
      /timeout/i,
    );
  }

  // Gemini 429
  {
    const fetchImpl = async () => new Response("rate limit", { status: 429 });
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    await assert.rejects(
      () =>
        provider.complete({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: "hi" }],
          reasoningLevel: "none",
          timeoutMs: 5_000,
        }),
      /429|RATE/i,
    );
  }

  // requireWebEvidence gate — memory-only answer is not PASS
  {
    const emptyEvidence: AIWebEvidence = { sources: [], citationSupports: [], searchQueries: [] };
    const google = mockProvider("google", async () => ({
      text: "From memory, Competitor A was founded in 1999 and has offices worldwide.",
      toolCalls: [] as AIToolCall[],
      usage: usage(),
      providerRequestId: "g-mem",
      webEvidence: emptyEvidence,
    }));
    const openai = mockProvider("openai", async () => ({
      text: "fallback memory",
      toolCalls: [] as AIToolCall[],
      usage: usage(),
      providerRequestId: "o-mem",
      webEvidence: emptyEvidence,
    }));
    const runtime = new AIRuntime({
      google,
      openai,
      usageRecorder: new InMemoryUsageRecorder(),
      paidFallbackEnabled: false,
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      missionId: "11111111-1111-4111-8111-111111111111",
      department: "research",
      taskClass: "RESEARCH",
      requireWebEvidence: true,
      messages: [{ role: "user", content: "Research Competitor A founding year with sources" }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "INSUFFICIENT_EVIDENCE");
  }

  // requireWebEvidence + real sources → can PASS quality
  {
    const webEvidence: AIWebEvidence = {
      sources: [
        {
          id: "s1",
          url: "https://example.com/about",
          title: "About",
          domain: "example.com",
          provider: "google",
        },
      ],
      citationSupports: [{ text: "Founded in 2010", sourceIds: ["s1"], sourceIndices: [0] }],
      searchQueries: ["example.com founded"],
    };
    const google = mockProvider("google", async (args) => {
      assert.equal(args.enableGoogleSearchGrounding, true);
      return {
        text: "Example Inc was founded in 2010 according to its about page. https://example.com/about",
        toolCalls: [] as AIToolCall[],
        usage: usage(),
        providerRequestId: "g-ok",
        webEvidence,
      };
    });
    const runtime = new AIRuntime({
      google,
      openai: mockProvider("openai", async () => {
        throw new Error("should not call openai");
      }, false),
      usageRecorder: new InMemoryUsageRecorder(),
    });
    const result = await runtime.execute({
      tenantId: "tenant-a",
      missionId: "11111111-1111-4111-8111-111111111111",
      department: "research",
      taskClass: "RESEARCH",
      requireWebEvidence: true,
      messages: [{ role: "user", content: "When was Example Inc founded? Cite sources." }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.webEvidence?.sources.length, 1);
  }

  // assessQuality with requireEvidence needs structured sources
  {
    const fail = assessQuality({
      taskClass: "RESEARCH",
      text: "A long enough research answer without any structured evidence at all.",
      requireEvidence: true,
      webEvidence: { sources: [], citationSupports: [], searchQueries: [] },
    });
    assert.equal(fail.decision, "FAIL");
    assert.ok(fail.reasons.includes("insufficient_web_evidence"));
  }

  console.log("web-evidence.test.ts: PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
