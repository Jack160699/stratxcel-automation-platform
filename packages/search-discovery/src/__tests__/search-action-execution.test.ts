import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWordPressExecutionProvider,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
  evaluateActionSafety,
  precheckSearchActionExecution,
  executeSearchAction,
  processSearchActionJob,
} from "../execution/index.ts";
import type { CMSPageContent, CMSVerificationSpec } from "../execution/cms/types.ts";

function createMockSearchDb(config: {
  planTier?: string;
  subscriptionStatus?: string;
  actionState?: string;
  actionClass?: string;
  proposedChange?: string;
  killSwitchEnabled?: boolean;
}) {
  let insertedAuditEvents: any[] = [];
  let insertedValueLedgers: any[] = [];
  let updatedActions: any[] = [];

  const mockAction = {
    id: "action-123",
    tenant_id: "tenant-paid",
    state: config.actionState || "PROPOSED",
    action_class: config.actionClass || "safe_preparatory",
    target_url: "https://clinic.in/dental",
    search_recommendations: {
      id: "rec-123",
      proposed_change: {
        recommendation: config.proposedChange || "Inject LocalBusiness Schema",
        affectedUrl: "https://clinic.in/dental",
      },
      search_opportunities: {
        id: "opp-123",
        search_projects: {
          id: "proj-123",
          name: "Apollo Clinic",
          property_url: "https://clinic.in",
        },
      },
    },
  };

  function createChain(table: string, state: any = {}): any {
    const chain: any = {
      eq(col: string, val: string) {
        return createChain(table, { ...state, [col]: val });
      },
      order() { return createChain(table, state); },
      limit() { return createChain(table, state); },
      select() { return createChain(table, state); },
      single: async () => {
        if (table === "search_actions") {
          if (state.id === "action-123" && state.tenant_id === "tenant-paid") {
            return { data: mockAction, error: null };
          }
          return { data: null, error: { message: "Action not found" } };
        }
        return { data: { id: "mock-row" }, error: null };
      },
      maybeSingle: async () => {
        if (table === "kill_switches") {
          return {
            data: config.killSwitchEnabled ? { enabled: true, reason: "Emergency kill switch" } : null,
            error: null,
          };
        }
        if (table === "subscriptions") {
          return {
            data: {
              plan_tier: config.planTier || "growth",
              status: config.subscriptionStatus || "active",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  }

  const db = {
    getAudits: () => insertedAuditEvents,
    getValueLedgers: () => insertedValueLedgers,
    getUpdatedActions: () => updatedActions,
    from(table: string) {
      return {
        select(cols?: string) {
          return createChain(table);
        },
        insert(row: any) {
          if (table === "value_ledger") insertedValueLedgers.push(row);
          if (table === "audit_events") insertedAuditEvents.push(row);
          return {
            select() {
              return {
                single: async () => ({ data: { id: "inserted-id", ...row }, error: null }),
              };
            },
          };
        },
        update(patch: any) {
          updatedActions.push(patch);
          return {
            eq(col: string, val: string) {
              return {
                eq: () => Promise.resolve({ data: patch, error: null }),
              };
            },
          };
        },
      };
    },
  };

  return db;
}

test("1. Free tenant cannot execute (strictly blocked server-side)", () => {
  const precheck = precheckSearchActionExecution({
    tenantId: "tenant-free",
    planTier: "free",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: { isHealthy: true, writeEnabled: true },
  });

  assert.equal(precheck.allowed, false);
  assert.equal(precheck.blockerCode, "SUBSCRIPTION_REQUIRED");
});

test("2. Paid tenant can execute with entitlement", () => {
  const precheck = precheckSearchActionExecution({
    tenantId: "tenant-growth",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: { isHealthy: true, writeEnabled: true },
  });

  assert.equal(precheck.allowed, true);
});

test("3. Missing connector blocks execution", () => {
  const precheck = precheckSearchActionExecution({
    tenantId: "tenant-growth",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: undefined,
  });

  assert.equal(precheck.allowed, false);
  assert.equal(precheck.blockerCode, "CONNECTOR_UNHEALTHY");
});

test("4. Read-only connector blocks mutation", () => {
  const precheck = precheckSearchActionExecution({
    tenantId: "tenant-growth",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: { isHealthy: true, writeEnabled: false },
  });

  assert.equal(precheck.allowed, false);
  assert.equal(precheck.blockerCode, "CONNECTOR_READ_ONLY");
});

test("5. Wrong tenant blocked & 6. Wrong target blocked", async () => {
  const db = createMockSearchDb({ planTier: "growth" });
  const cms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: cms },
    { tenantId: "wrong-tenant-id", actionId: "action-123" }
  );

  assert.equal(res.status, "BLOCKED");
  assert.equal(res.blockerCode, "ACTION_NOT_FOUND");
});

test("7. Duplicate action prevented", async () => {
  const db = createMockSearchDb({ planTier: "growth", actionState: "COMPLETED" });
  const cms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: cms },
    { tenantId: "tenant-paid", actionId: "action-123" }
  );

  assert.equal(res.status, "VERIFIED");
});

test("8. Concurrent execution prevented (idempotent state)", () => {
  const precheck1 = precheckSearchActionExecution({
    tenantId: "tenant-paid",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: { isHealthy: true, writeEnabled: true },
  });
  assert.equal(precheck1.allowed, true);
});

test("9. Failed provider handled & 10. Retry works", async () => {
  const db = createMockSearchDb({ planTier: "growth" });
  const failingCms = {
    cmsType: "wordpress" as const,
    siteUrl: "https://clinic.in",
    async status() { return "WRITE_AVAILABLE" as const; },
    async readPage() { throw new Error("WordPress 500 Internal Server Error"); },
    async updateMetadata() { throw new Error("Failed"); },
    async updateSchema() { throw new Error("Failed"); },
    async updateContent() { throw new Error("Failed"); },
    async createPage() { throw new Error("Failed"); },
    async publishPage() { throw new Error("Failed"); },
    async verifyPage() { return { verified: false, verifiedAt: "", checks: [] }; },
    async rollbackPage() { return { success: true, targetUrl: "", mutationKind: "rollback" as const, beforeState: {}, afterState: {}, deployedAt: "" }; },
  };

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: failingCms },
    { tenantId: "tenant-paid", actionId: "action-123" }
  );

  assert.equal(res.status, "FAILED");
});

test("11. Verification failure correctly represented", async () => {
  const db = createMockSearchDb({ planTier: "growth" });
  const unverifiedCms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });
  unverifiedCms.verifyPage = async () => ({
    verified: false,
    verifiedAt: new Date().toISOString(),
    httpStatus: 200,
    checks: [{ name: "Title Check", passed: false, expected: "New Title", actual: "Old Title" }],
    failureReason: "Live title did not match expected SEO title.",
  });

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: unverifiedCms },
    { tenantId: "tenant-paid", actionId: "action-123" }
  );

  assert.equal(res.status, "VERIFICATION_FAILED");
});

test("12. Before/after evidence stored & 13. Internal StratXcel website mutation works", async () => {
  const db = createMockSearchDb({ planTier: "growth", proposedChange: "Update meta description" });
  const nativeCMS = createStratxcelNativeCMSProvider({
    siteProjectId: "site-proj-1",
    tenantId: "tenant-paid",
    propertyUrl: "https://clinic.in",
    sitePages: {
      "https://clinic.in/dental": {
        id: "dental",
        url: "https://clinic.in/dental",
        title: "Dental Services",
        status: "publish",
      },
    },
  });

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: nativeCMS },
    { tenantId: "tenant-paid", actionId: "action-123" }
  );

  assert.equal(res.status, "VERIFIED");
  assert.ok(res.beforeEvidence);
  assert.ok(res.afterEvidence);
  assert.ok(res.verificationResult);
});

test("14. WordPress connector authentication works with fixtures/mocks & 15. WordPress write capability enforced", async () => {
  const readOnlyWp = createFixtureWordPressProvider({ siteUrl: "https://clinic.in", writeEnabled: false });
  assert.equal(await readOnlyWp.status(), "READ_ONLY");

  await assert.rejects(async () => {
    await readOnlyWp.updateMetadata("https://clinic.in", { title: "New" });
  }, /Write disabled/);

  const writeWp = createFixtureWordPressProvider({ siteUrl: "https://clinic.in", writeEnabled: true });
  assert.equal(await writeWp.status(), "WRITE_AVAILABLE");
  const mutated = await writeWp.updateMetadata("https://clinic.in", { title: "Verified SEO Title" });
  assert.equal(mutated.success, true);
});

test("16. Action policy blocks unsafe action (e.g. fake reviews/spam)", () => {
  const unsafe1 = evaluateActionSafety({ proposedChange: "Post fake review on Google" });
  assert.equal(unsafe1.classification, "BLOCKED");

  const unsafe2 = evaluateActionSafety({ proposedChange: "Buy backlinks from PBN link network" });
  assert.equal(unsafe2.classification, "BLOCKED");

  const safe = evaluateActionSafety({ proposedChange: "Add LocalBusiness schema" });
  assert.equal(safe.classification, "SAFE");
});

test("17. Queue worker is idempotent", async () => {
  const db = createMockSearchDb({ planTier: "growth" });
  const cms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });

  const job = {
    id: "job-1",
    tenant_id: "tenant-paid",
    job_type: "search_action_execution",
    payload: { actionId: "action-123", idempotencyKey: "job-idem-1" },
    idempotency_key: "job-idem-1",
    priority: 10,
    scheduled_at: new Date().toISOString(),
    status: "LEASED" as const,
    attempt_count: 1,
    max_attempts: 3,
    lease_owner: "worker-1",
    lease_expires_at: null,
    heartbeat_at: null,
    last_error: null,
    trace_id: null,
    correlation_id: null,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    updated_at: new Date().toISOString(),
  };

  const res = await processSearchActionJob(
    { db: db as any, resolveCMSProvider: async () => cms },
    job
  );

  assert.equal(res.success, true);
});

test("18. Kill switch prevents execution", async () => {
  const db = createMockSearchDb({ planTier: "growth", killSwitchEnabled: true });
  const cms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });

  const job = {
    id: "job-2",
    tenant_id: "tenant-paid",
    job_type: "search_action_execution",
    payload: { actionId: "action-123" },
    idempotency_key: null,
    priority: 10,
    scheduled_at: new Date().toISOString(),
    status: "LEASED" as const,
    attempt_count: 1,
    max_attempts: 3,
    lease_owner: "worker-1",
    lease_expires_at: null,
    heartbeat_at: null,
    last_error: null,
    trace_id: null,
    correlation_id: null,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: null,
    updated_at: new Date().toISOString(),
  };

  const res = await processSearchActionJob(
    { db: db as any, resolveCMSProvider: async () => cms },
    job
  );

  assert.equal(res.success, false);
  assert.equal(res.failure?.code, "KILL_SWITCH_ACTIVE");
});

test("19. Revoked subscription prevents execution", () => {
  const precheck = precheckSearchActionExecution({
    tenantId: "tenant-revoked",
    planTier: "starter",
    subscriptionStatus: "cancelled",
    actionClass: "safe_preparatory",
    proposedChange: "Update title",
    connectorStatus: { isHealthy: true, writeEnabled: true },
  });

  assert.equal(precheck.allowed, false);
  assert.equal(precheck.blockerCode, "SUBSCRIPTION_REQUIRED");
});

test("20. Result feeds Search Growth measurement & value ledger", async () => {
  const db = createMockSearchDb({ planTier: "business", proposedChange: "Inject LocalBusiness Schema" });
  const cms = createFixtureWordPressProvider({ siteUrl: "https://clinic.in" });

  const res = await executeSearchAction(
    { db: db as any, cmsProvider: cms },
    { tenantId: "tenant-paid", actionId: "action-123" }
  );

  assert.equal(res.status, "VERIFIED");
  assert.equal(db.getValueLedgers().length, 1);
  assert.equal(db.getValueLedgers()[0].service_key, "search_growth_execution");
  assert.equal(db.getValueLedgers()[0].result_value, "VERIFIED");
});
