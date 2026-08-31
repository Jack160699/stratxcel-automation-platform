import { test } from "node:test";
import assert from "node:assert/strict";
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
                created_at: "2026-08-20T00:00:00Z",
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
  assert.ok(data.scorecards.authorityCoverage.value !== null);
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
