import type { SearchDb } from "../repository.ts";
import { persistEntityGraph } from "../repository.ts";
import { runSearchAnalysis, type SearchRuntimeInput } from "../runtime.ts";
import {
  type AISearchMeasurementProvider,
  createUnavailableAISearchProvider,
  generateAISearchQuerySet,
  analyzeAICitationGaps,
  calculateAIVisibilityScore,
  type AIVisibilityResult,
} from "../ai-search/index.ts";
import { runExternalAuthorityAnalysis } from "../authority/orchestrator.ts";
import { evaluateStrategyMode } from "./strategy.ts";
import { generateContinuousDefenseAlerts } from "./alerts.ts";
import { buildOutcomeAttributionTimeline } from "./attribution.ts";
import type { ContinuousLoopResult } from "./types.ts";

export interface ContinuousLoopDeps {
  db: SearchDb;
  aiProvider?: AISearchMeasurementProvider;
}

export interface ContinuousLoopInput {
  tenantId: string;
  propertyUrl: string;
  propertyName: string;
  plan: "free" | "starter" | "growth" | "business" | "scale";
  services?: string[];
  locations?: string[];
  competitors?: string[];
  idempotencyKey: string;
  /**
   * Real signals for entity-consistency analysis (see
   * authority/entity-graph.ts). All optional and honestly conservative
   * when omitted -- hasGbp/hasSchema default to false (not "unknown"; a
   * caller without a real signal should not claim either), and `nap` is
   * only used when a caller has real comparable phone/address data on
   * both sides. Never fabricated here.
   */
  hasGbp?: boolean;
  hasSchema?: boolean;
  nap?: {
    websitePhone?: string | null;
    gbpPhone?: string | null;
    websiteAddress?: string | null;
    gbpAddress?: string | null;
  };
}

/**
 * Orchestrates the Continuous Search Growth Loop:
 * OBSERVE → ANALYZE → DETECT → PRIORITIZE → PLAN → EXECUTE → VERIFY → MEASURE → LEARN
 */
export async function runContinuousGrowthLoop(
  deps: ContinuousLoopDeps,
  input: ContinuousLoopInput
): Promise<ContinuousLoopResult> {
  const db = deps.db;
  const clientDomain = new URL(input.propertyUrl).hostname;
  const aiProvider = deps.aiProvider ?? createUnavailableAISearchProvider();
  const aiStatus = await aiProvider.status();

  // 1. Generate AI Search Queries
  const aiQueries = generateAISearchQuerySet({
    businessName: input.propertyName,
    services: input.services || [],
    locations: input.locations || [],
    competitors: input.competitors || [],
    limit: input.plan === "business" || input.plan === "scale" ? 8 : 4,
  });

  // 2. Probe AI Search Providers (if available)
  const aiResults: AIVisibilityResult[] = [];
  if (aiStatus === "AVAILABLE") {
    for (const q of aiQueries) {
      try {
        const res = await aiProvider.measureQuery({
          query: q.query,
          clientDomain,
          competitorDomains: input.competitors || [],
          location: q.targetLocation,
        });
        aiResults.push(res);
      } catch {
        // Safe probe isolation
      }
    }
  }

  // 3. Analyze AI Citation Gaps
  const aiGaps = analyzeAICitationGaps({
    clientDomain,
    clientBusinessName: input.propertyName,
    results: aiResults,
  });

  // 4. Calculate AI Visibility Score
  const aiScore = calculateAIVisibilityScore(aiResults);

  // 5. Run Search Analysis
  const analysisResult = await runSearchAnalysis(
    db,
    {
      tenantId: input.tenantId,
      propertyUrl: input.propertyUrl,
      propertyName: input.propertyName,
      plan: input.plan,
      runType: "weekly",
      triggerSource: "scheduler",
      idempotencyKey: input.idempotencyKey,
    },
    {
      services: input.services,
      locations: input.locations,
      competitors: input.competitors,
    }
  );

  // 6. Fetch Competitor Snapshots & Deltas from Run
  const { data: compSnapshot } = await db
    .from("search_measurement_snapshots")
    .select("values")
    .eq("tenant_id", input.tenantId)
    .eq("source", "competitor_intelligence")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshots = (compSnapshot?.values as any)?.snapshots || [];
  const deltas = (compSnapshot?.values as any)?.deltas || [];

  // 7. Evaluate Strategy Mode (TAKE, DEFEND, EXPAND, RECOVER)
  const strategy = evaluateStrategyMode({ deltas, snapshots });

  // 8. Generate Continuous Defense Alerts
  const alerts = generateContinuousDefenseAlerts({ deltas, aiGaps });

  // 9. Fetch Actions & Build Outcome Attribution Timeline
  const { data: actions } = await db
    .from("search_actions")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const timeline = buildOutcomeAttributionTimeline({
    actions: actions || [],
    deltas,
    aiResults,
  });

  // 9b. Entity Consistency (NAP/brand/service/location graph)
  //
  // Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
  // search_entity_nodes was applied to production with a real schema but
  // no real caller ever computed or persisted entity nodes -- wiring the
  // real authority/entity-graph.ts engine (and its persistence) into the
  // one function that already runs on every real growth cycle, using only
  // signals this session can honestly source here (input.hasGbp/hasSchema/
  // nap, all caller-supplied and conservative when omitted -- never
  // fabricated).
  const entityProjectId = analysisResult.run?.project_id || (compSnapshot as any)?.project_id;
  if (entityProjectId) {
    const { entityNodes } = runExternalAuthorityAnalysis({
      businessName: input.propertyName,
      domain: clientDomain,
      services: input.services || [],
      locations: input.locations || [],
      competitors: input.competitors,
      hasGbp: input.hasGbp,
      hasSchema: input.hasSchema,
      nap: input.nap,
    });
    await persistEntityGraph(db, { tenantId: input.tenantId, projectId: entityProjectId, nodes: entityNodes });
  }

  // 10. Persist Strategy State & AI Snapshots
  //
  // Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
  // this upsert's result was never checked at all, so a real write failure
  // (e.g. search_strategy_states not existing -- see the scheduler route's
  // matching fix) was completely silent: the function still returned a
  // normal-looking success result, and the caller reported "COMPLETED".
  // Surfacing the failure honestly instead of a false success.
  const { error: persistError } = await db
    .from("search_strategy_states")
    .upsert(
      {
        tenant_id: input.tenantId,
        project_id: analysisResult.run?.project_id || (compSnapshot as any)?.project_id || "default",
        current_mode: strategy.mode,
        movement_status: strategy.movement,
        active_alerts: alerts,
        growth_timeline: timeline,
        last_evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,project_id" }
    );

  if (persistError) {
    throw new Error(`Failed to persist search_strategy_states for tenant ${input.tenantId}: ${persistError.message}`);
  }

  return {
    strategyMode: strategy.mode,
    movementStatus: strategy.movement,
    alerts,
    timeline,
    aiScore: aiScore as any,
    reEvaluatedOpportunitiesCount: aiGaps.length,
  };
}
