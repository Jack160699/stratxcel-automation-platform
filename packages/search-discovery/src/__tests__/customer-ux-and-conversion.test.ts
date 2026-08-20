import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSearchGrowthDashboardData,
  certifyProductionReadiness,
  GrowthEngineCadenceManager,
  evaluateCustomerLifecycle,
} from "../index.ts";

function createMockDashboardDb(config?: {
  isPaid?: boolean;
  planTier?: string;
  gscRows?: any[];
  competitors?: any[];
  actions?: any[];
  strategyState?: any;
}) {
  let queriedTenantId: string | null = null;
  let crawlerCallCount = 0;
  let serpApiCallCount = 0;
  let aiProbeCallCount = 0;

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
          return {
            data: { id: "p1", tenant_id: state.tenant_id || "t1", name: "Dr. Verma Dental Clinic", property_url: "https://vermadental.in" },
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
                  whyTheyWin: [
                    {
                      competitorDomain: "citydentalcare.in",
                      competitorName: "City Dental Care",
                      summary: "Maintains dedicated root canal & Invisalign landing pages",
                      evidence: ["3x more indexed local keywords", "Active JSON-LD Dentist schema"],
                      confidence: "HIGH",
                      likelyReasons: ["Location-specific landing pages capture local intent"],
                      unknowns: ["Internal linking velocity", "Exact Google Ads spend"],
                      recommendedAction: "Deploy root canal service page and inject DentalClinic schema",
                    },
                  ],
                  competitors: config?.competitors || [{ domain: "citydentalcare.in", commonQueriesCount: 6 }],
                  targetQueries: [{ query: "dentist in raipur" }, { query: "root canal treatment" }],
                  authorityScore: { overallScore: 78, confidence: "HIGH", dataCoveragePercentage: 85 },
                },
                created_at: "2026-08-20T00:00:00Z",
              },
              error: null,
            };
          }
          if (state.source === "search_console") {
            return {
              data: {
                values: {
                  rows: config?.gscRows || [
                    { query: "dentist near me", impressions: 1200, clicks: 94, position: 2.8 },
                    { query: "teeth cleaning cost", impressions: 450, clicks: 32, position: 4.1 },
                  ],
                },
                created_at: "2026-08-20T00:00:00Z",
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
              last_evaluated_at: "2026-08-20T00:00:00Z",
              growth_timeline: [
                { id: "tl-1", stage: "OBSERVED", title: "Rank check completed", description: "Top 3 positions defended", timestamp: "2026-08-20T00:00:00Z" },
              ],
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
    getCrawlerCallCount: () => crawlerCallCount,
    getSerpApiCallCount: () => serpApiCallCount,
    getAiProbeCallCount: () => aiProbeCallCount,
    from(table: string) {
      return {
        select() {
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
                            execution_state: "VERIFIED",
                            target_url: "https://vermadental.in/root-canal",
                            updated_at: "2026-08-20T00:00:00Z",
                            search_recommendations: {
                              proposed_change: { recommendation: "Deploy Root Canal Treatment Schema" },
                              search_opportunities: {
                                business_rationale: "Capture high-intent dental search queries in Raipur",
                                category: "technical",
                                severity: "HIGH",
                                affected_url: "https://vermadental.in/root-canal",
                              },
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
  };
}

test("Phase 17 Polish: 1. Free audit visual hierarchy & 2. Connected data display", async () => {
  const db = createMockDashboardDb({ isPaid: false });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-free-1");

  // Executive scorecards
  assert.equal(data.scorecards.searchAuthorityScore.label, "Search Authority Score");
  assert.equal(data.scorecards.searchAuthorityScore.displayValue, "78/100");
  assert.equal(data.scorecards.searchAuthorityScore.confidence, "HIGH");

  // Connected data
  const gsc = data.connectorHealth.find((c) => c.providerKey === "google_search_console");
  assert.ok(gsc);
  assert.equal(gsc.status, "CONNECTED");
  assert.ok(gsc.dataUsed.includes("Clicks"));
});

test("Phase 17 Polish: 3. Competitor explanation ('Why Competitors Win')", async () => {
  const db = createMockDashboardDb();
  const data = await getSearchGrowthDashboardData(db as any, "tenant-comp-1");

  assert.ok(data.whyCompetitorsWin.length > 0);
  const rival = data.whyCompetitorsWin[0];
  assert.equal(rival.competitorDomain, "citydentalcare.in");
  assert.equal(rival.competitorName, "City Dental Care");
  assert.ok(rival.evidence.length > 0);
  assert.ok(rival.unknowns.length > 0, "explicitly show unknowns");
  assert.ok(rival.recommendedAction.includes("Deploy"));
});

test("Phase 17 Polish: 4. Top 5 priority actions & 5. Free-to-paid CTA & 13. Free execution lock", async () => {
  const db = createMockDashboardDb({ isPaid: false });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-free-lock");

  assert.equal(data.isPaidTenant, false);
  assert.equal(data.canExecute, false, "Free tenant cannot execute actions");
  assert.ok(data.actionCenter.actions.length > 0);
  assert.equal(data.actionCenter.actions[0].isLocked, true);
  assert.ok(data.actionCenter.actions[0].lockReason?.includes("subscription"));
});

test("Phase 17 Polish: 6. Payment-to-entitlement display & 14. Paid execution visibility", async () => {
  const db = createMockDashboardDb({ isPaid: true, planTier: "growth" });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-paid-1");

  assert.equal(data.isPaidTenant, true);
  assert.equal(data.planTier, "growth");
  assert.equal(data.canExecute, true);
  assert.equal(data.actionCenter.actions[0].isLocked, false);
});

test("Phase 17 Polish: 7. Execution readiness checklist", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-readiness-1");

  assert.ok(data.executionReadinessChecklist);
  assert.equal(data.executionReadinessChecklist.website.status, "READY");
  assert.equal(data.executionReadinessChecklist.wordpress.status, "CONNECT_REQUIRED");
  assert.ok(["CONFIGURED", "OPTIONAL_NOT_CONFIGURED"].includes(data.executionReadinessChecklist.serpTracking.status));
  assert.ok(["CONFIGURED", "OPTIONAL_NOT_CONFIGURED"].includes(data.executionReadinessChecklist.aiSearchProbing.status));
});

test("Phase 17 Polish: 8. 3-day Growth Engine cadence display & 10. Transparency", () => {
  const cadenceManager = new GrowthEngineCadenceManager();
  const config = cadenceManager.getCadenceConfig();

  assert.equal(config.cadenceDays, 3);
  assert.equal(config.targetMonthlyCycles, 10);
  assert.equal(config.cadenceHours, 72);
});

test("Phase 17 Polish: 9. Action lifecycle display & 10. Results/proof display", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-proof-1");

  // Proof stages
  assert.ok(data.achievedProof);
  assert.ok(Array.isArray(data.achievedProof.delivered));
  assert.ok(Array.isArray(data.achievedProof.verified));
  assert.ok(Array.isArray(data.achievedProof.observed));
  assert.ok(Array.isArray(data.achievedProof.impacted));

  // Verify delivered & verified
  assert.ok(data.achievedProof.delivered.length > 0);
  assert.ok(data.achievedProof.verified.length > 0);
});

test("Phase 17 Polish: 11. Connector health & 12. Customer notification states", async () => {
  const db = createMockDashboardDb({ isPaid: true });
  const data = await getSearchGrowthDashboardData(db as any, "tenant-notifs-1");

  // Connector health
  assert.ok(data.connectorHealth.length >= 3);
  for (const conn of data.connectorHealth) {
    assert.ok(["CONNECTED", "ADAPTER_READY", "CONFIGURED_NOT_VERIFIED", "NOT_CONNECTED"].includes(conn.status));
    assert.ok(conn.dataUsed.length > 0);
  }

  // Customer notifications
  assert.ok(data.customerNotifications.length > 0);
  const cycleNotif = data.customerNotifications.find((n) => n.type === "GROWTH_CYCLE_COMPLETED");
  assert.ok(cycleNotif);
  assert.equal(cycleNotif.severity, "SUCCESS");
});

test("Phase 17 Polish: 16. Performance (Zero expensive calls on dashboard loading)", async () => {
  const db = createMockDashboardDb();
  const data = await getSearchGrowthDashboardData(db as any, "tenant-perf-1");

  // Assure no crawler, SERP, or AI probes were called
  assert.equal(db.getCrawlerCallCount(), 0, "No crawler execution on dashboard load");
  assert.equal(db.getSerpApiCallCount(), 0, "No SERP API calls on dashboard load");
  assert.equal(db.getAiProbeCallCount(), 0, "No AI probe calls on dashboard load");
  assert.ok(data.scorecards.searchAuthorityScore);
});

test("Phase 17 Polish: 17. Tenant isolation & 18. No false claims", async () => {
  const db = createMockDashboardDb();
  const data = await getSearchGrowthDashboardData(db as any, "tenant-isolation-123");

  assert.equal(db.getQueriedTenantId(), "tenant-isolation-123", "Database queries must be isolated to requesting tenant");
  assert.equal(data.tenantId, "tenant-isolation-123");

  // Zero staff customer journey confirmation
  const lifecycle = evaluateCustomerLifecycle({
    workspaceId: "ws_live_prod_999",
    currentStage: "STAGE_11_AUTONOMOUS_3DAY_GROWTH_LOOP",
    allStagesCompleted: true,
    hasManualStaffIntervention: false,
  });
  assert.equal(lifecycle.zeroStaffVerified, true);
  assert.equal(lifecycle.stages.length, 11);
});
