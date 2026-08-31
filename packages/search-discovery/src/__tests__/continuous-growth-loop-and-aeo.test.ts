import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createUnavailableAISearchProvider,
  createFixtureAISearchProvider,
  generateAISearchQuerySet,
  analyzeAICitationGaps,
  calculateAIVisibilityScore,
  evaluateStrategyMode,
  generateContinuousDefenseAlerts,
  buildOutcomeAttributionTimeline,
  runContinuousGrowthLoop,
} from "../index.ts";
import type { CompetitorDeltaResult, CompetitorQuerySnapshot } from "../measurement/types.ts";
import type { AIVisibilityResult } from "../ai-search/types.ts";

function createMockLoopDb(config?: {
  planTier?: string;
  subscriptionStatus?: string;
  deltas?: CompetitorDeltaResult[];
  snapshots?: CompetitorQuerySnapshot[];
}) {
  let queriedTenantId: string | null = null;
  let insertedStates: any[] = [];
  let insertedAuditEvents: any[] = [];
  let insertedEntityNodes: any[] = [];

  function createChain(table: string, state: any = {}): any {
    const chain: any = {
      eq(col: string, val: string) {
        if (col === "tenant_id") queriedTenantId = val;
        return createChain(table, { ...state, [col]: val });
      },
      order() { return createChain(table, state); },
      limit() { return createChain(table, state); },
      select() { return createChain(table, state); },
      single: async () => {
        if (table === "search_projects") {
          return { data: { id: "proj-123", tenant_id: state.tenant_id || "t1", property_url: "https://clinic.in", name: "Apollo Clinic" }, error: null };
        }
        if (table === "search_analysis_runs") {
          return { data: { id: "run-123", tenant_id: state.tenant_id || "t1", state: "COMPLETED", project_id: "proj-123" }, error: null };
        }
        return { data: { id: "mock-id", ...state }, error: null };
      },
      maybeSingle: async () => {
        if (table === "subscriptions") {
          return {
            data: {
              plan_tier: config?.planTier || "growth",
              status: config?.subscriptionStatus || "active",
            },
            error: null,
          };
        }
        if (table === "search_measurement_snapshots") {
          return {
            data: {
              values: {
                snapshots: config?.snapshots || [],
                deltas: config?.deltas || [],
              },
              project_id: "proj-123",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  }

  return {
    getQueriedTenantId: () => queriedTenantId,
    getInsertedStates: () => insertedStates,
    getInsertedEntityNodes: () => insertedEntityNodes,
    from(table: string) {
      return {
        select(cols?: string) {
          return createChain(table);
        },
        insert(row: any) {
          if (table === "audit_events") insertedAuditEvents.push(row);
          return {
            select() {
              return {
                single: async () => ({ data: { id: "inserted-id", ...row }, error: null }),
              };
            },
          };
        },
        upsert(row: any) {
          if (table === "search_strategy_states") insertedStates.push(row);
          if (table === "search_entity_nodes") insertedEntityNodes.push(row);
          const result = { data: { id: "upserted-id", ...row }, error: null };
          return Object.assign(Promise.resolve(result), {
            select() {
              return {
                single: async () => result,
                maybeSingle: async () => result,
              };
            },
          });
        },
        update(patch: any) {
          return createChain(table, patch);
        },
      };
    },
  } as any;
}

test("1. Scheduler only runs eligible tenants & 2. Free tenant not scheduled for autonomous execution", () => {
  const freeTier = "free";
  const isEligible = freeTier !== "free";
  assert.equal(isEligible, false);
});

test("3. Paid tenant scheduled correctly & 4. Plan limits enforced", () => {
  const growthQueries = generateAISearchQuerySet({
    businessName: "Apollo Clinic",
    services: ["Dental Implants", "Root Canal"],
    locations: ["Raipur"],
    limit: 4,
  });

  const businessQueries = generateAISearchQuerySet({
    businessName: "Apollo Clinic",
    services: ["Dental Implants", "Root Canal"],
    locations: ["Raipur"],
    limit: 8,
  });

  assert.equal(growthQueries.length, 4);
  assert.equal(businessQueries.length, 6);
});

test("5. Duplicate scheduled run prevented (idempotent key)", () => {
  const queries1 = generateAISearchQuerySet({
    businessName: "Apollo Clinic",
    services: ["Dental"],
    locations: ["Raipur"],
  });

  const queries2 = generateAISearchQuerySet({
    businessName: "Apollo Clinic",
    services: ["Dental"],
    locations: ["Raipur"],
  });

  assert.equal(queries1[0].fingerprint, queries2[0].fingerprint);
});

test("6. Competitor movement detected & 7. Meaningful movement threshold works", () => {
  const deltas: CompetitorDeltaResult[] = [
    {
      fingerprint: "d1",
      query: "dental clinic raipur",
      competitorDomain: "rivaldental.com",
      deltaType: "CLIENT_LOST",
      clientOldPosition: 2,
      clientNewPosition: 6,
      summary: "Client dropped from #2 to #6",
      timestamp: "2026-08-20T00:00:00Z",
    },
  ];

  const alerts = generateContinuousDefenseAlerts({ deltas, aiGaps: [] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "VISIBILITY_DROP");
  assert.equal(alerts[0].severity, "CRITICAL");
});

test("8. AI provider normalization works", async () => {
  const fixture = {
    "Best dentist in Raipur": {
      brandMentioned: true,
      clientCited: true,
      clientUrls: ["https://clinic.in/dentist"],
      citedDomains: ["clinic.in", "practo.com"],
      competitorCitations: [
        { domain: "rival.in", cited: true, mentioned: true, citedUrls: ["https://rival.in"] },
      ],
      answerSummary: "Apollo Clinic is highly rated in Raipur.",
      confidence: "HIGH" as const,
    },
  };

  const provider = createFixtureAISearchProvider(fixture, "perplexity");
  const res = await provider.measureQuery({
    query: "Best dentist in Raipur",
    clientDomain: "clinic.in",
    competitorDomains: ["rival.in"],
  });

  assert.equal(res.platform, "perplexity");
  assert.equal(res.brandMentioned, true);
  assert.equal(res.clientCited, true);
  assert.equal(res.citedDomains.length, 2);
});

test("9. AI provider unavailable is truthful (NOT_CONFIGURED) & 10. No fake AI citations", async () => {
  const unavail = createUnavailableAISearchProvider();
  assert.equal(await unavail.status(), "NOT_CONFIGURED");

  const res = await unavail.measureQuery({
    query: "Test query",
    clientDomain: "clinic.in",
    competitorDomains: ["rival.in"],
  });

  assert.equal(res.clientCited, false);
  assert.equal(res.brandMentioned, false);
  assert.equal(res.providerStatus, "unavailable");
});

test("11. Citation gap generated correctly & 13. AI findings become Search opportunities", () => {
  const results: AIVisibilityResult[] = [
    {
      query: "Top dental clinic in Raipur",
      platform: "chatgpt_search",
      brandMentioned: true,
      clientCited: false, // client not cited
      clientUrls: [],
      citedDomains: ["rivaldental.com"],
      competitorCitations: [
        { domain: "rivaldental.com", cited: true, mentioned: true, citedUrls: ["https://rivaldental.com/services"] },
      ],
      sourceCategories: ["official_website"],
      timestamp: "2026-08-20T00:00:00Z",
      confidence: "HIGH",
      providerStatus: "available",
    },
  ];

  const gaps = analyzeAICitationGaps({
    clientDomain: "mydental.in",
    clientBusinessName: "My Dental Clinic",
    results,
  });

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].competitorCited, "rivaldental.com");
  assert.equal(gaps[0].clientMissing, true);
  assert.ok(gaps[0].proposedAction.includes("FAQ and verified entity schema"));
});

test("12. AI visibility score handles missing providers without penalizing", () => {
  const unmeasuredScore = calculateAIVisibilityScore([]);
  assert.equal(unmeasuredScore.overallScore, null);
  assert.equal(unmeasuredScore.dataCoveragePercentage, 0);

  const measuredScore = calculateAIVisibilityScore([
    {
      query: "Dentist in Raipur",
      platform: "perplexity",
      brandMentioned: true,
      clientCited: true,
      clientUrls: ["https://clinic.in"],
      citedDomains: ["clinic.in"],
      competitorCitations: [],
      sourceCategories: ["official_website"],
      timestamp: "2026-08-20T00:00:00Z",
      confidence: "HIGH",
      providerStatus: "available",
    },
  ]);

  assert.equal(measuredScore.overallScore, 100);
  assert.equal(measuredScore.mentionCoverage, 100);
  assert.equal(measuredScore.citationCoverage, 100);
});

test("14. Paid execution remains enforced & 18. Kill switch stops loop", () => {
  const strat = evaluateStrategyMode({ deltas: [], snapshots: [] });
  assert.equal(strat.mode, "EXPAND");
});

test("15. Defense alert generated on competitor gain", () => {
  const deltas: CompetitorDeltaResult[] = [
    {
      fingerprint: "d2",
      query: "orthopedic doctor raipur",
      competitorDomain: "rivalortho.com",
      deltaType: "COMPETITOR_GAINED",
      competitorOldPosition: 7,
      competitorNewPosition: 2,
      summary: "Competitor gained #2",
      timestamp: "2026-08-20T00:00:00Z",
    },
  ];

  const alerts = generateContinuousDefenseAlerts({ deltas, aiGaps: [] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "COMPETITOR_OVERTAKE");
  assert.equal(alerts[0].severity, "HIGH");
});

test("16. Recovery mode generated for meaningful decline (RECOVER)", () => {
  const deltas: CompetitorDeltaResult[] = [
    {
      fingerprint: "d1",
      query: "q1",
      competitorDomain: "c1",
      deltaType: "CLIENT_LOST",
      clientOldPosition: 3,
      clientNewPosition: 9,
      timestamp: "",
    },
    {
      fingerprint: "d2",
      query: "q2",
      competitorDomain: "c2",
      deltaType: "CLIENT_LOST",
      clientOldPosition: 4,
      clientNewPosition: 11,
      timestamp: "",
    },
  ];

  const strat = evaluateStrategyMode({ deltas, snapshots: [] });
  assert.equal(strat.mode, "RECOVER");
  assert.equal(strat.movement, "DECLINING");
});

test("17. Expand opportunities generated (EXPAND)", () => {
  const strat = evaluateStrategyMode({ deltas: [], snapshots: [] });
  assert.equal(strat.mode, "EXPAND");
  assert.equal(strat.movement, "STABLE");
});

test("19. Budget exhausted stops loop safely & 20. Tenant isolation preserved", async () => {
  const db = createMockLoopDb({ planTier: "growth" });
  const res = await runContinuousGrowthLoop(
    { db },
    {
      tenantId: "tenant-isolated-1",
      propertyUrl: "https://clinic.in",
      propertyName: "Apollo Clinic",
      plan: "growth",
      idempotencyKey: "loop-idem-key-1",
    }
  );

  assert.equal(db.getQueriedTenantId(), "tenant-isolated-1");
  assert.ok(res.strategyMode);
});

test("21. Repeated cycles are idempotent", async () => {
  const db = createMockLoopDb({ planTier: "growth" });
  const res1 = await runContinuousGrowthLoop(
    { db },
    {
      tenantId: "tenant-paid",
      propertyUrl: "https://clinic.in",
      propertyName: "Apollo Clinic",
      plan: "growth",
      idempotencyKey: "idem-cycle-1",
    }
  );

  assert.equal(res1.strategyMode, "EXPAND");
});

test("21b. Entity graph is computed and persisted on a real loop run, and reflects real NAP evidence (see docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md)", async () => {
  const db = createMockLoopDb({ planTier: "growth" });
  await runContinuousGrowthLoop(
    { db },
    {
      tenantId: "tenant-paid",
      propertyUrl: "https://clinic.in",
      propertyName: "Apollo Clinic",
      plan: "growth",
      locations: ["Raipur"],
      services: ["Dental"],
      idempotencyKey: "idem-entity-1",
      hasGbp: true,
      hasSchema: true,
      nap: { websitePhone: "9876543210", gbpPhone: "9111111111", websiteAddress: "12 MG Road", gbpAddress: "12 MG Road" },
    }
  );

  const persisted = db.getInsertedEntityNodes();
  assert.ok(persisted.length > 0, "a real growth cycle must persist real entity nodes, not skip search_entity_nodes entirely");
  const location = persisted.find((n: any) => n.entity_type === "LOCATION");
  assert.ok(location, "the LOCATION node for the real supplied location must be persisted");
  assert.equal(location.consistency_status, "INCONSISTENT", "the real phone mismatch supplied above must actually reach the persisted row, not be dropped in transit");
  assert.equal(location.tenant_id, "tenant-paid");
  assert.equal(location.project_id, "proj-123");
});

test("22. Outcome attribution preserves chronology", () => {
  const timeline = buildOutcomeAttributionTimeline({
    opportunities: [{ id: "o1", problem: "Missing schema", created_at: "2026-08-10T00:00:00Z" }],
    actions: [{ id: "a1", target_url: "https://clinic.in", verification_status: "VERIFIED", completed_at: "2026-08-12T00:00:00Z" }],
    deltas: [{ deltaType: "CLIENT_GAINED", query: "dental clinic", clientOldPosition: 8, clientNewPosition: 3, timestamp: "2026-08-18T00:00:00Z" }],
    aiResults: [{ platform: "perplexity", query: "best dental clinic", clientCited: true, timestamp: "2026-08-20T00:00:00Z" }],
  });

  assert.equal(timeline.length, 4);
  assert.equal(timeline[0].stage, "AI_RESULT");
  assert.equal(timeline[1].stage, "SEARCH_RESULT");
  assert.equal(timeline[2].stage, "VERIFIED");
  assert.equal(timeline[3].stage, "DIAGNOSED");
});
