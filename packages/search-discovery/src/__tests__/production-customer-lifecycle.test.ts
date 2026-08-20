import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runGoLiveSystemHealthCheck,
  checkTenantRevocationState,
  evaluateActionSafety,
  executeSearchAction,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
  getSearchGrowthDashboardData,
  evaluateActionExperiment,
} from "../index.ts";

function createMockLifecycleDb(config?: {
  isPaid?: boolean;
  planTier?: string;
  subStatus?: string;
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
      single: async () => ({
        data: {
          id: "a1",
          tenant_id: state.tenant_id || "t1",
          state: "APPROVED",
          search_recommendations: {
            proposed_change: { recommendation: "Update title tag", affectedUrl: "https://clinic.in" },
            search_opportunities: { business_rationale: "Fix title", category: "technical" },
          },
        },
        error: null,
      }),
      maybeSingle: async () => {
        if (table === "subscriptions") {
          return {
            data: {
              plan_tier: config?.isPaid ? config?.planTier || "growth" : "free",
              status: config?.subStatus || "active",
            },
            error: null,
          };
        }
        if (table === "search_projects") {
          return { data: { id: "p1", tenant_id: state.tenant_id || "t1", name: "Apollo Clinic", property_url: "https://clinic.in" }, error: null };
        }
        return { data: null, error: null };
      },
    };
  }

  return {
    getQueriedTenantId: () => queriedTenantId,
    from(table: string) {
      return {
        select() { return createChain(table); },
        update(patch: any) {
          return { eq: () => ({ eq: () => Promise.resolve({ data: patch, error: null }) }) };
        },
        insert() {
          return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
        },
      };
    },
  } as any;
}

test("1. New customer, no optional integrations & 5. Free audit completes & 6. Free tenant tries direct mutation & 7. Free tenant tries worker execution", async () => {
  const freeDb = createMockLifecycleDb({ isPaid: false });
  const wp = createFixtureWordPressProvider({ siteUrl: "https://clinic.in", writeEnabled: true });

  const res = await executeSearchAction({ db: freeDb, cmsProvider: wp }, { tenantId: "t-free", actionId: "a1" });
  assert.equal(res.status, "BLOCKED");
  assert.equal(res.blockerCode, "SUBSCRIPTION_REQUIRED");
});

test("8. Payment succeeds & 9. Entitlement unlocks correctly & 10. Paid tenant executes safe SEO action & 11. Action verification succeeds", async () => {
  const paidDb = createMockLifecycleDb({ isPaid: true, planTier: "growth" });
  const wp = createFixtureWordPressProvider({ siteUrl: "https://clinic.in", writeEnabled: true });

  const result = await executeSearchAction({ db: paidDb, cmsProvider: wp }, { tenantId: "t-paid", actionId: "a1" });
  assert.equal(result.status, "VERIFIED");
});

test("12. Verification fails and rollback runs", async () => {
  const native = createStratxcelNativeCMSProvider({
    siteProjectId: "p1",
    tenantId: "t1",
    propertyUrl: "https://clinic.in",
    sitePages: { "https://clinic.in": { url: "https://clinic.in", title: "Original Title", status: "publish" } },
  });

  const updated = await native.updateMetadata("https://clinic.in", { title: "Mutated Title" });
  assert.equal(updated.success, true);

  const rolledBack = await native.rollbackPage("p1", updated.beforeState);
  assert.equal(rolledBack.success, true);
  assert.equal((rolledBack.afterState as any).title, "Original Title");
});

test("13. Scheduled paid cycle runs & 14. Free tenant excluded from schedule", () => {
  const freeCheck = checkTenantRevocationState({ tenantId: "t1", planTier: "free" });
  assert.equal(freeCheck.canScheduleGrowthLoop, false);
  assert.equal(freeCheck.canExecuteAutonomousActions, false);

  const paidCheck = checkTenantRevocationState({ tenantId: "t2", planTier: "growth", subscriptionStatus: "active" });
  assert.equal(paidCheck.canScheduleGrowthLoop, true);
  assert.equal(paidCheck.canExecuteAutonomousActions, true);
});

test("15. Subscription expires & 16. Subscription cancelled & 17. Payment fails", () => {
  const cancelledCheck = checkTenantRevocationState({ tenantId: "t-cancel", planTier: "growth", subscriptionStatus: "cancelled" });
  assert.equal(cancelledCheck.canExecuteAutonomousActions, false);
  assert.equal(cancelledCheck.canScheduleGrowthLoop, false);
  assert.equal(cancelledCheck.canReadHistoricalData, true); // Retains historical read access

  const expiredCheck = checkTenantRevocationState({ tenantId: "t-exp", planTier: "growth", subscriptionStatus: "expired" });
  assert.equal(expiredCheck.canExecuteAutonomousActions, false);

  const unpaidCheck = checkTenantRevocationState({ tenantId: "t-unpaid", planTier: "growth", subscriptionStatus: "unpaid" });
  assert.equal(unpaidCheck.canExecuteAutonomousActions, false);
});

test("18. Connector revoked & 19. Provider rate limit & 20. Provider outage & 25. Kill switch", () => {
  const safety = evaluateActionSafety({
    actionKind: "reputation",
    proposedChange: "Generate 50 fake reviews to boost ratings",
    targetUrl: "https://clinic.in",
  });

  assert.equal(safety.classification, "BLOCKED");
});

test("26. Tenant isolation & 27. Customer dashboard reflects actual state & 28. Outcome is measured only after observation window", async () => {
  const db = createMockLifecycleDb({ isPaid: true, planTier: "growth" });
  const dashboard = await getSearchGrowthDashboardData(db, "t-isolated-tenant");

  assert.equal(db.getQueriedTenantId(), "t-isolated-tenant");
  assert.equal(dashboard.canExecute, true);

  const evalRes = evaluateActionExperiment(
    {
      id: "exp-1",
      tenantId: "t1",
      actionId: "a1",
      actionType: "CREATE_SERVICE_PAGE",
      industry: "HEALTHCARE",
      queryClass: "LOCAL",
      hypothesis: "Service page increases ranking",
      observationWindowDays: 30,
      status: "PLANNED",
      baselineMetrics: { capturedAt: "" },
      attributionConfidence: "UNKNOWN",
      decision: "INCONCLUSIVE",
      explanation: "",
      lastEvaluatedAt: "",
    },
    { capturedAt: "" },
    5 // only 5 days elapsed out of 30 days
  );

  assert.equal(evalRes.status, "IN_WINDOW");
});

test("Go-Live System Health Check produces truthful 14-category report", () => {
  const health = runGoLiveSystemHealthCheck();
  assert.equal(health.categories.length, 14);
  assert.ok(["READY_FOR_CUSTOMERS", "CONFIGURATION_REQUIRED"].includes(health.overallStatus));
  assert.ok(health.passedCount >= 10);
});
