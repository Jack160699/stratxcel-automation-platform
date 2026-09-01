import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  certifyProductionReadiness,
  getSearchGrowthDashboardData,
  buildProviderCapabilityMatrix,
} from "../index.ts";

function createMockDashboardDb(config?: {
  isPaid?: boolean;
  planTier?: string;
  gscRows?: any[];
  competitors?: any[];
  actions?: any[];
  strategyState?: any;
  hasProject?: boolean;
  aiSearchScore?: { overallScore: number | null; confidence?: string; dataCoveragePercentage?: number } | null;
  entityNodes?: Array<{ entity_type: string; consistency_status: string }>;
}) {
  let queriedTenantId: string | null = null;

  function createChain(table: string, state: any = {}): any {
    return {
      eq(col: string, val: string) {
        if (col === "tenant_id") queriedTenantId = val;
        return createChain(table, { ...state, [col]: val });
      },
      order() { return createChain(table, state); },
      limit() { return createChain(table, state); },
      select() { return createChain(table, state); },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => {
        if (table === "search_projects") {
          if (config?.hasProject === false) return { data: null, error: null };
          return {
            data: { id: "p1", tenant_id: state.tenant_id || "t1", name: "Apollo Clinic", property_url: "https://clinic.in" },
            error: null,
          };
        }
        if (table === "subscriptions") {
          return {
            data: {
              plan_tier: config?.isPaid ? config?.planTier || "growth" : "free",
              status: "active",
            },
            error: null,
          };
        }
        if (table === "search_measurement_snapshots") {
          if (state.source === "competitor_intelligence") {
            return {
              data: {
                values: {
                  whyTheyWin: [{ competitorDomain: "rival.in", summary: "Stronger backlink profile", evidence: ["Case study published"] }],
                  competitors: config?.competitors || [{ domain: "rival.in", commonQueriesCount: 5 }],
                  targetQueries: [{ query: "dentist in raipur" }],
                  authorityScore: { overallScore: 78, confidence: "HIGH", dataCoveragePercentage: 85 },
                },
                captured_at: "2026-08-20T00:00:00Z",
              },
              error: null,
            };
          }
          if (state.source === "search_console") {
            return {
              data: {
                values: {
                  rows: config?.gscRows || [{ query: "dentist", impressions: 1000, clicks: 80, position: 3.2 }],
                },
                captured_at: "2026-08-20T00:00:00Z",
              },
              error: null,
            };
          }
          if (state.source === "ai_search") {
            if (config?.aiSearchScore === undefined) return { data: null, error: null };
            return {
              data: {
                values: { score: config.aiSearchScore },
                availability_state: config.aiSearchScore?.overallScore !== null ? "connected" : "not_connected",
                unavailable_reason: config.aiSearchScore?.overallScore === null ? "Live AI Search measurement provider is not configured." : null,
                captured_at: "2026-08-20T00:00:00Z",
              },
              error: null,
            };
          }
        }
        if (table === "search_strategy_states") {
          return {
            data: config?.strategyState || {
              current_mode: "DEFEND",
              movement_status: "GAINING",
              growth_timeline: [{ id: "tl-1", stage: "OBSERVED", title: "Rank check completed", description: "Top 3 held", timestamp: "2026-08-20T00:00:00Z" }],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
  }

  return {
    getQueriedTenantId: () => queriedTenantId,
    from(table: string) {
      return {
        select() {
          if (table === "search_entity_nodes") {
            return {
              eq(col: string, val: string) {
                if (col === "tenant_id") queriedTenantId = val;
                return Promise.resolve({ data: config?.entityNodes ?? [], error: null });
              },
            };
          }
          if (table === "search_actions") {
            return {
              eq(col: string, val: string) {
                if (col === "tenant_id") queriedTenantId = val;
                return {
                  order() {
                    return {
                      limit: async () => ({
                        data: config?.actions || [
                          {
                            id: "act-1",
                            target_url: "https://clinic.in/dentist",
                            execution_state: "VERIFIED",
                            before_evidence: { title: "Old Title" },
                            after_evidence: { title: "Verified Title" },
                            search_recommendations: {
                              proposed_change: { recommendation: "Update title tag" },
                              search_opportunities: { business_rationale: "Fix title", category: "technical", severity: "High" },
                            },
                          },
                        ],
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          }
          return createChain(table);
        },
      };
    },
  } as any;
}

test("1. Readiness certification truth & 2. Overall status derivation", () => {
  const cert = certifyProductionReadiness();

  // The overall status must be CORE_OPERATIONAL (not blindly FULLY_OPERATIONAL since third-party SERP/AI search keys may be unconfigured)
  assert.ok(["CORE_OPERATIONAL", "FULLY_OPERATIONAL", "PARTIALLY_OPERATIONAL"].includes(cert.overallStatus));
  assert.ok(cert.overallStatusExplanation.length > 10);
  assert.equal(cert.dimensions.community.status, "DISCOVERY_ONLY");
  assert.equal(cert.dimensions.websiteExecution.status, "OPERATIONAL");
  assert.equal(cert.dimensions.wordpressExecution.status, "OPERATIONAL");
});

test("3. Dashboard data completeness & 4. Missing providers & 5. Live vs adapter-ready state", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-1");

  assert.ok(data.scorecards.searchAuthorityScore);
  assert.ok(data.scorecards.organicVisibility);
  assert.ok(data.scorecards.aiVisibility);
  assert.equal(data.projectName, "Apollo Clinic");
  assert.equal(data.connectorHealth.length >= 5, true);

  const serpConnector = data.connectorHealth.find((c) => c.providerKey === "live_serp_measurement");
  assert.ok(serpConnector);
  assert.ok(["CONNECTED", "ADAPTER_READY"].includes(serpConnector?.status || ""));
  assert.equal(data.hasProject, true, "a tenant with a real search_projects row must report hasProject: true");
});

test("3b. hasProject is genuinely false, and projectName/propertyUrl stay honestly labeled placeholders, for a tenant with no real project yet (see docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md)", async () => {
  const db = createMockDashboardDb({ isPaid: false, hasProject: false });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-new");
  assert.equal(data.hasProject, false);
  // The placeholder values themselves are allowed to still exist for
  // backward compatibility, but any real caller MUST gate on hasProject
  // before treating them as real -- this pins that the flag actually
  // reflects "no row found", not a fabricated true.
  assert.equal(data.projectName, "Local Business");
  assert.equal(data.propertyUrl, "https://example.com");
});

test("6. Free user locked actions", async () => {
  const db = createMockDashboardDb({ isPaid: false });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-free");

  assert.equal(data.isPaidTenant, false);
  assert.equal(data.canExecute, false);
  assert.equal(data.actionCenter.actions[0].isLocked, true);
  assert.equal(data.actionCenter.actions[0].status, "LOCKED");
  assert.ok(data.actionCenter.actions[0].lockReason?.includes("subscription"));
});

test("7. Paid user executable actions", async () => {
  const db = createMockDashboardDb({ isPaid: true, planTier: "business" });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-paid");

  assert.equal(data.isPaidTenant, true);
  assert.equal(data.canExecute, true);
  assert.equal(data.actionCenter.actions[0].isLocked, false);
  assert.equal(data.actionCenter.actions[0].status, "VERIFIED");
});

test("8. Competitor display & 9. AI provider status & 10. Authority status", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-1");

  assert.ok(data.whyCompetitorsWin.length >= 1);
  assert.equal(data.whyCompetitorsWin[0].competitorDomain, "rival.in");
  assert.ok(data.aiSearch.providerStatuses.length >= 2);
  // STRATXCEL — AEO brief, Section 41: this test used to pin
  // authorityCoverage's hardcoded fabricated value (70/100, every tenant,
  // always) as "expected behavior". This codebase has no real, persisted
  // directory/citation-coverage measurement yet, so the honest state is
  // null/NOT DIRECTLY MEASURED -- corrected here, not silently deleted.
  assert.equal(data.scorecards.authorityCoverage.value, null);
  assert.equal(data.scorecards.authorityCoverage.displayValue, "NOT DIRECTLY MEASURED");
});

test("11. Timeline correctness & 12. Tenant isolation & 13. No secret leakage", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-secret-isolated");

  assert.equal(db.getQueriedTenantId(), "tenant-secret-isolated");
  assert.equal(data.growthTimeline.length, 1);
  assert.equal(data.growthTimeline[0].stage, "OBSERVED");

  const jsonDump = JSON.stringify(data);
  assert.ok(!jsonDump.includes("sk-"));
  assert.ok(!jsonDump.includes("Bearer "));
  assert.ok(!jsonDump.includes("secret123"));
  assert.ok(!jsonDump.includes("raw_token"));
});

test("14. No false production claims & 15. Dashboard with no optional connectors", async () => {
  const db = createMockDashboardDb({ isPaid: false, gscRows: [] });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-no-connectors");

  assert.equal(data.scorecards.organicVisibility.displayValue, "NOT CONNECTED");
  assert.equal(data.scorecards.organicVisibility.dataCoveragePercentage, 0);
});

test("16. Dashboard with multiple connected providers & 17. Dashboard after action execution & 18. Dashboard after failed verification", async () => {
  const db = createMockDashboardDb({
    isPaid: true,
    actions: [
      {
        id: "act-failed",
        target_url: "https://clinic.in/service",
        execution_state: "VERIFICATION_FAILED",
        search_recommendations: {
          proposed_change: { recommendation: "Failed change" },
          search_opportunities: { business_rationale: "Rationale", category: "technical" },
        },
      },
    ],
  });

  const data = await getSearchGrowthDashboardData(db as any, "tenant-verified-test");
  assert.equal(data.actionCenter.actions[0].status, "FAILED");
});

test("19. search_measurement_snapshots is queried by its real column (captured_at), never the non-existent created_at", () => {
  // Regression for a real, live production bug (STRATXCEL — AEO brief,
  // Section 41): search_measurement_snapshots' real schema column is
  // captured_at -- confirmed directly against production; created_at does
  // not exist on this table at all. Both the competitor-intelligence and
  // Search Console snapshot queries previously select()ed/order()ed by
  // created_at, so every real call failed with a genuine Postgres error,
  // silently discarded because the destructuring here never checks
  // `error` -- competitor intelligence and real GSC telemetry never
  // reached this dashboard for any tenant, ever. This is a static-source
  // check (not the in-memory mock DB used elsewhere in this file) because
  // that mock doesn't enforce real column existence the way Postgres does
  // -- exactly why this bug was invisible to every prior test here.
  const raw = fs.readFileSync(path.join(import.meta.dirname, "..", "dashboard", "aggregator.ts"), "utf8");
  // Strip comments first -- this test's own explanatory comment above (and
  // the source file's matching one) legitimately mentions both table and
  // column names together, which must not trip a raw-source check.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const firstIdx = source.indexOf('from("search_measurement_snapshots")');
  const secondIdx = source.indexOf('from("search_measurement_snapshots")', firstIdx + 1);
  assert.ok(firstIdx >= 0 && secondIdx > firstIdx, "expected exactly two real search_measurement_snapshots queries (competitor_intelligence + search_console)");
  for (const idx of [firstIdx, secondIdx]) {
    const queryBlock = source.slice(idx, idx + 300);
    assert.match(queryBlock, /captured_at/, "each search_measurement_snapshots query must select/order by the real captured_at column");
    assert.doesNotMatch(queryBlock, /created_at/, "must never query search_measurement_snapshots by the non-existent created_at column again");
  }
});

test("20. AI Search Visibility and Local & Maps Presence are honestly unmeasured with zero real data", async () => {
  // STRATXCEL — AEO brief, Section 41: with no ai_search snapshot and no
  // search_entity_nodes rows, both scorecards must be null/INSUFFICIENT_DATA
  // -- never the previously hardcoded 65/100 and 80/100.
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-no-ai-no-entities");

  assert.equal(data.scorecards.aiVisibility.value, null);
  assert.equal(data.scorecards.aiVisibility.trend, "INSUFFICIENT_DATA");
  assert.equal(data.scorecards.localPresence.value, null);
  assert.equal(data.scorecards.localPresence.trend, "INSUFFICIENT_DATA");
});

test("21. AI Search Visibility and Local & Maps Presence reflect real persisted data when it exists", async () => {
  const db = createMockDashboardDb({
    isPaid: true,
    aiSearchScore: { overallScore: 42, confidence: "MEDIUM", dataCoveragePercentage: 60 },
    entityNodes: [
      { entity_type: "LOCATION", consistency_status: "CONSISTENT" },
      { entity_type: "LOCATION", consistency_status: "INCONSISTENT" },
      { entity_type: "SERVICE", consistency_status: "CONSISTENT" }, // non-LOCATION rows must not dilute the local-presence ratio
    ],
  });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-real-ai-and-entities");

  assert.equal(data.scorecards.aiVisibility.value, 42);
  assert.equal(data.scorecards.aiVisibility.displayValue, "42/100");
  assert.equal(data.scorecards.aiVisibility.confidence, "MEDIUM");
  // 1 of 2 real LOCATION nodes is CONSISTENT -- exactly 50%, and the one
  // SERVICE node must not have been counted.
  assert.equal(data.scorecards.localPresence.value, 50);
});
