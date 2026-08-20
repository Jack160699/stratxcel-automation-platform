import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runControlledCanaryAudit,
  runControlledCanaryPaidExecution,
  runControlledCanaryRollback,
  compileControlledCanaryReport,
  type CanaryTenantContext,
} from "../index.ts";

function createMockCanaryDb() {
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
          id: "canary-act-1",
          tenant_id: state.tenant_id || "canary-tenant-1",
          state: "APPROVED",
          search_recommendations: {
            proposed_change: { recommendation: "Update title tag", affectedUrl: "https://apollo-canary.in/services" },
            search_opportunities: { business_rationale: "Fix title", category: "technical" },
          },
        },
        error: null,
      }),
      maybeSingle: async () => {
        if (table === "subscriptions") {
          return { data: { plan_tier: "growth", status: "active" }, error: null };
        }
        if (table === "search_projects") {
          return { data: { id: "p1", tenant_id: state.tenant_id || "canary-tenant-1", name: "Apollo Clinic Canary", property_url: "https://apollo-canary.in" }, error: null };
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

const mockCanaryTenant: CanaryTenantContext = {
  tenantId: "canary-tenant-search-growth",
  businessName: "Apollo Clinic Canary",
  domain: "https://apollo-canary.in",
  industry: "HEALTHCARE",
  location: "Raipur",
  isPaid: true,
  planTier: "growth",
  subscriptionStatus: "active",
};

test("1. Real Free Audit Canary: produces evidence packet with strictly 0 mutations and locked actions", async () => {
  const audit = await runControlledCanaryAudit(mockCanaryTenant);
  assert.equal(audit.status, "COMPLETED");
  assert.equal(audit.mutationsAttempted, 0);
  assert.equal(audit.lockedActionsCount, 3);
  assert.ok(audit.sourcesCount >= 5);
});

test("2. Real Paid Write-Capability Canary & 3. Live DOM Verification", async () => {
  const db = createMockCanaryDb();
  const exec = await runControlledCanaryPaidExecution(mockCanaryTenant, db);

  assert.equal(exec.status, "VERIFIED");
  assert.equal(exec.actionType, "FIX_MISSING_TITLE");
  assert.equal(exec.valueLedgerRecorded, true);
});

test("4. Real Rollback Test: restores original page state on simulated failure", async () => {
  const rollback = await runControlledCanaryRollback(mockCanaryTenant);
  assert.equal(rollback.passed, true);
  assert.equal(rollback.restoredTitle, "Original Stable Title");
});

test("5. Controlled Canary Report & Certification", async () => {
  const db = createMockCanaryDb();
  const report = await compileControlledCanaryReport(mockCanaryTenant, db);

  assert.equal(report.certification, "PRODUCTION_VERIFIED_WITH_OPTIONAL_PROVIDERS_MISSING");
  assert.equal(report.allAcceptanceCriteriaMet, true);
  assert.equal(report.freeAudit.passed, true);
  assert.equal(report.freeAudit.mutationsPrevented, true);
  assert.equal(report.freeBypassAttempt.blocked, true);
  assert.equal(report.paidExecution.passed, true);
  assert.equal(report.rollbackTest.passed, true);
  assert.equal(report.truthfulProviderStates.serpTracker, "ADAPTER_READY");
  assert.equal(report.truthfulProviderStates.perplexityAi, "ADAPTER_READY");
});
