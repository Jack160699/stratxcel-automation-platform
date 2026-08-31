import { createTenantAIRuntime, resolveTenantMonthSpend, resolveTenantPlanTier } from "@stratxcel/ai-runtime";
import { researchAIExecutorFromRuntime } from "@stratxcel/workforce-core";
import {
  runGroundedResearch,
  type ResearchArtifactPersister,
  mapResearchToTrendCandidates,
  evaluateTrendRelevance,
  type TrendSignal,
  type TrendScoringContext,
} from "@stratxcel/search-discovery";
import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL Master Execution Prompt Sections 16-17 ("Live Competitor
 * Intelligence" / "Live Social Trend Intelligence"): real, grounded market
 * research, not a static curated list.
 *
 * Critical finding this pass: a complete, real, tested, production-grade
 * grounded-research engine ALREADY EXISTS in this codebase --
 * @stratxcel/search-discovery's research module (runGroundedResearch),
 * backed by @stratxcel/ai-runtime's real Gemini Google Search grounding
 * (packages/ai-runtime/src/providers/gemini-grounding.ts,
 * task-policies.ts's RESEARCH policy: allowGoogleSearchGrounding=true),
 * complete with a deterministic quality gate, SSRF-safe source
 * verification, and prompt-injection defenses (see
 * docs/architecture/RESEARCH_ENGINE_V1.md). It was NOT missing -- it was
 * simply never wired into the autonomous Social Autopilot pipeline, only
 * into the agentic Mission/Workforce flow (`research.web` capability).
 *
 * This module is that wiring, reusing the real engine instead of building
 * a second one:
 * - AI execution: the real `researchAIExecutorFromRuntime` adapter
 *   (packages/workforce-core/src/adapters/research-web.ts) wraps a real
 *   `createTenantAIRuntime` instance -- the exact same production AI
 *   Runtime factory every other billable AI call in this codebase uses.
 * - Artifact persistence: DELIBERATELY bypassed. The real persister writes
 *   to `mission_artifacts`, which is FK-scoped to a real `missions` row
 *   (see supabase/migrations/20260803121000_missions.sql's RLS policy) --
 *   forcing a synthetic mission per weekly research pass would be a much
 *   larger, riskier integration than this pass warrants. Instead, a
 *   minimal always-succeeds persister stub is supplied (satisfies the
 *   real runGroundedResearch's dependency contract without writing
 *   anywhere), and the REAL research result (summary/claims/sources) is
 *   returned directly to the caller, which persists it into
 *   social_autopilot_weekly_campaigns.strategy instead -- the correct
 *   home for this data given the current integration boundary.
 *
 * Honest, not fabricated: on any failure (AI Runtime not configured,
 * budget resolution failure, research status !== "PASS") this returns
 * `available: false` with a real reason, never invented findings.
 */
export interface LiveMarketIntelligence {
  available: boolean;
  summary: string | null;
  claims: Array<{ text: string; statementKind: string }>;
  sources: Array<{ url: string; domain: string; title?: string }>;
  provider: "google" | "openai" | null;
  reason: string | null;
  gatheredAt: string;
  /**
   * Real trend signals derived from the SAME grounded-research call above
   * -- not a second paid AI call. Root-caused via
   * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no trend-relevance
   * classification existed anywhere in this codebase, and this function's
   * own research question already asks about "current content trends,
   * formats, and hooks" -- the answer was already being fetched and
   * discarded except as freeform claim text. Now also mapped through the
   * real trend relevance engine (USE_NOW/ADAPT/MONITOR/IGNORE), scored
   * against a conservative default context (this function only has
   * businessName/industry/location -- services/targetAudience default to
   * empty rather than guessed, which the relevance engine treats as
   * neutral, not a fabricated match). Always `[]` when research is
   * unavailable -- never fabricated.
   */
  trendSignals: TrendSignal[];
}

function noopArtifactPersister(): ResearchArtifactPersister {
  return {
    persist: async () => ({ ok: true, id: crypto.randomUUID() }),
  };
}

export async function gatherLiveMarketIntelligence(
  writeClient: ServiceClient,
  input: { tenantId: string; businessName: string; industry: string; location: string | null }
): Promise<LiveMarketIntelligence> {
  const gatheredAt = new Date().toISOString();
  const unavailable = (reason: string): LiveMarketIntelligence => ({
    available: false,
    summary: null,
    claims: [],
    sources: [],
    provider: null,
    reason,
    gatheredAt,
    trendSignals: [],
  });

  try {
    const spend = await resolveTenantMonthSpend(writeClient as never, input.tenantId);
    if (!spend.ok) return unavailable("usage_ledger_unavailable");

    const plan = await resolveTenantPlanTier(writeClient as never, input.tenantId);
    const { runtime } = createTenantAIRuntime({
      tenantId: input.tenantId,
      missionId: null,
      plan,
      spentUsdThisMonth: spend.spentUsd,
      productionBillable: true,
      internalWriteClient: writeClient as never,
    });

    const ai = researchAIExecutorFromRuntime(runtime);
    if (!ai.isConfigured()) return unavailable("ai_runtime_not_configured");

    const locationClause = input.location ? ` serving businesses in ${input.location}` : "";
    const question =
      `Who are ${input.businessName || "this business"}'s real, current competitors or alternatives in the ${input.industry || "its"} space${locationClause}, and what current (2026) social media / Instagram content trends, formats, and hooks are genuinely working well for businesses like this right now? ` +
      `Name 2-4 real competitors/alternatives with their positioning, and 2-3 real current content trends with a brief note on why each works.`;

    const result = await runGroundedResearch(
      {
        tenantId: input.tenantId,
        missionId: "weekly_market_intelligence",
        requestId: crypto.randomUUID(),
        question,
        taskClass: "RESEARCH",
        maxSources: 6,
        primarySourcesPreferred: true,
        requireWebEvidence: true,
        requireClaimCitations: false,
      },
      { ai, artifacts: noopArtifactPersister() }
    );

    if (result.status !== "PASS") {
      return unavailable(result.humanReason ?? result.reasonCode ?? result.status);
    }

    const scoringContext: TrendScoringContext = {
      industry: input.industry || "",
      services: [],
      brandValues: [],
      targetAudience: [],
      availableChannels: ["social"],
      riskTolerance: "MEDIUM",
    };
    const trendSignals = mapResearchToTrendCandidates(result, { platform: "social" }).map((candidate, i) =>
      evaluateTrendRelevance(candidate, scoringContext, { id: `${input.tenantId}-${gatheredAt}-${i}`, tenantId: input.tenantId }),
    );

    return {
      available: true,
      summary: result.summary,
      claims: result.claims.map((c) => ({ text: c.text, statementKind: c.statementKind })),
      sources: result.sources.map((s) => ({ url: s.url, domain: s.domain, title: s.title })),
      provider: result.provider,
      reason: null,
      gatheredAt: result.searchedAt,
      trendSignals,
    };
  } catch (err) {
    return unavailable(err instanceof Error ? err.message.slice(0, 240) : "market_intelligence_failed");
  }
}
