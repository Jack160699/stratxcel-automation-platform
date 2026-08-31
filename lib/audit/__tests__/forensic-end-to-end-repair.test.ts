import assert from "node:assert/strict";
import { deriveAuditCustomerState, hasValidAuditReport } from "../customer-state.ts";
import { updateGoogleConnectionConfig } from "../../../packages/search-discovery/src/google/repository.ts";
import { provisionTenantConnectorsFromMetadata } from "../../social/provisioning.ts";
import { deriveGlobalCustomerState } from "../../billing/customer-entitlement.ts";
import { resolveCustomerPlanSummary } from "../../billing/customer-plan.ts";

console.log("Running StratXcel Full Production Forensic End-to-End Test Suite...\n");

function createMockService() {
  const socialAccounts: any[] = [];
  const googleConnections: any[] = [];
  const whatsappBindings: any[] = [];
  const auditOrders: any[] = [];
  const auditGenerations: any[] = [];

  const service: any = {
    from(table: string) {
      if (table === "social_accounts") {
        // Generic filter-accumulator chain (matches audit-connector-insights.test.ts's
        // makeFakeService pattern): supports any real ordering/count of
        // .eq()/.is() before .maybeSingle(), instead of hand-nested
        // fixed-depth callbacks -- found live via test:forensic on this
        // exact release branch: provisioning.ts's real ownerScopedAccount
        // lookup chains .is("tenant_id", null).eq(...).eq(...), a shape
        // the old fixed-depth-2-eq-only mock never supported, so `.is`
        // threw and the whole re-pointing path silently failed every run.
        function socialAccountsChain(filters: Record<string, any>): any {
          return {
            eq(col: string, val: any) {
              return socialAccountsChain({ ...filters, [col]: val });
            },
            is(col: string, val: any) {
              return socialAccountsChain({ ...filters, [col]: val });
            },
            async maybeSingle() {
              const found = socialAccounts.find((r) =>
                Object.entries(filters).every(([col, val]) => (r[col] ?? null) === val)
              );
              return { data: found || null, error: null };
            },
          };
        }
        return {
          select(_cols?: string) {
            return socialAccountsChain({});
          },
          insert(payload: any) {
            socialAccounts.push({ ...payload, id: `soc_${Date.now()}_${Math.random()}` });
            return Promise.resolve({ data: payload, error: null });
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const target = socialAccounts.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
        };
      }

      if (table === "search_google_connections") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: any) {
                return {
                  async maybeSingle() {
                    const found = googleConnections.find((r) => r[col] === val);
                    return { data: found || null, error: null };
                  },
                  async single() {
                    const found = googleConnections.find((r) => r[col] === val);
                    return { data: found || null, error: found ? null : new Error("Not found") };
                  },
                };
              },
            };
          },
          insert(payload: any) {
            googleConnections.push({ ...payload, id: `gconn_${Date.now()}` });
            return Promise.resolve({ data: payload, error: null });
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                return {
                  select() {
                    return {
                      async single() {
                        const target = googleConnections.find((r) => r[col] === val);
                        if (target) Object.assign(target, patch);
                        return { data: target, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          upsert(payload: any) {
            const existing = googleConnections.find((r) => r.tenant_id === payload.tenant_id);
            if (existing) Object.assign(existing, payload);
            else googleConnections.push({ ...payload, id: `gconn_${Date.now()}` });
            return Promise.resolve({ data: existing || googleConnections[googleConnections.length - 1], error: null });
          },
        };
      }

      if (table === "whatsapp_phone_bindings") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: any) {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          async maybeSingle() {
                            const found = whatsappBindings.find((r) => r[col] === val);
                            return { data: found || null, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: any) {
            whatsappBindings.push({ ...payload, id: `wa_${Date.now()}` });
            return Promise.resolve({ data: payload, error: null });
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const target = whatsappBindings.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
        };
      }

      if (table === "audit_orders") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: any) {
                return {
                  async maybeSingle() {
                    const found = auditOrders.find((r) => r[col] === val);
                    return { data: found || null, error: null };
                  },
                };
              },
            };
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                const target = auditOrders.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    _state: { socialAccounts, googleConnections, whatsappBindings, auditOrders, auditGenerations },
  };

  return service;
}

// =========================================================================
// Test 1: Single Canonical Tenant Identity & Connector Persistence
// =========================================================================
console.log("Test 1: Single Canonical Tenant Identity & Connector Persistence...");

const mockDb = createMockService();
const TENANT_ID = "tenant_test_12345";
const USER_ID = "user_test_67890";

// Provision connectors from onboarding metadata
const summary = await provisionTenantConnectorsFromMetadata(mockDb, {
  tenantId: TENANT_ID,
  userId: USER_ID,
  userMetadata: {
    onboarding_whatsapp_verification: { phone: "+919876543210", verifiedAt: new Date().toISOString() },
    onboarding_oauth_connections: {
      instagram: { providerAccountId: "ig_123", username: "aurora_cafe", displayName: "Aurora Cafe" },
      facebook: { providerAccountId: "fb_456", username: "auroracafe", displayName: "Aurora Cafe Page" },
      youtube: { providerAccountId: "yt_789", username: "auroracafe_yt", displayName: "Aurora Cafe Channel" },
      google_business: { searchConsoleSiteUrl: "https://auroracafe.in", ga4PropertyId: "ga4_998877" },
    },
  },
});

assert.equal(summary.whatsappProvisioned, true, "WhatsApp phone binding must be provisioned");
assert.equal(summary.socialAccountsProvisioned.length >= 3, true, "Social accounts must be provisioned");
assert.equal(summary.googleConnectionsProvisioned, true, "Google connection must be provisioned");

// Verify all written records share the exact canonical tenant ID
const accounts = mockDb._state.socialAccounts;
assert.ok(accounts.every((a: any) => a.tenant_id === TENANT_ID), "All social accounts must match canonical tenant ID");
// This test's fixture provides onboarding metadata alone (no
// social_tokens row, no real evidence of a usable token) -- per
// provisioning.ts's own real, deliberate fix (see its header comment,
// found live against a real production tenant), an account provisioned
// from metadata alone must never be fabricated as CONNECTED. It's
// RECONNECT_REQUIRED until a real token is verified. This assertion used
// to expect the disproven fabricating behavior; found stale via
// test:forensic on this release branch, fixed to match the real,
// currently-correct honesty fix rather than reintroducing it.
assert.ok(accounts.some((a: any) => a.platform === "instagram" && a.status === "RECONNECT_REQUIRED"), "Instagram must be honestly RECONNECT_REQUIRED, not fabricated CONNECTED, with no real token evidence");
assert.ok(accounts.some((a: any) => a.platform === "facebook" && a.status === "RECONNECT_REQUIRED"), "Facebook must be honestly RECONNECT_REQUIRED, not fabricated CONNECTED, with no real token evidence");
assert.ok(accounts.some((a: any) => a.platform === "youtube" && a.status === "RECONNECT_REQUIRED"), "YouTube must be honestly RECONNECT_REQUIRED, not fabricated CONNECTED, with no real token evidence");

console.log("✓ Single canonical tenant identity and connector persistence verified.");

// =========================================================================
// Test 2: Google Search Console & GA4 Property Selection Persistence
// =========================================================================
console.log("\nTest 2: Google Search Console & GA4 Property Selection Persistence...");

const updatedGoogle = await updateGoogleConnectionConfig(mockDb, {
  tenantId: TENANT_ID,
  searchConsoleSiteUrl: "https://auroracafe.in/shop",
  ga4PropertyId: "ga4_properties_445566",
  ga4PropertyDisplayName: "Aurora Online Store",
});

assert.equal(updatedGoogle.search_console_site_url, "https://auroracafe.in/shop", "Search console site URL must persist");
assert.equal(updatedGoogle.ga4_property_id, "ga4_properties_445566", "GA4 property ID must persist");
assert.equal(updatedGoogle.ga4_property_display_name, "Aurora Online Store", "GA4 property display name must persist");

console.log("✓ Google Search Console & GA4 property persistence verified.");

// =========================================================================
// Test 3: Audit Lifecycle Progression & Report Validation
// =========================================================================
console.log("\nTest 3: Audit Lifecycle Progression & Report Validation...");

const unstartedOrder = {
  id: "ord_111",
  status: "in_review" as const,
  business_name: "Aurora Cafe",
  industry: "Food & Beverage",
  website_url: "https://auroracafe.in",
  deep_dive_answers: { answers: { primaryGoal: "grow_local_sales" } },
  goals_answers: { goal: "grow" },
  report_data: null,
};

assert.equal(deriveAuditCustomerState(unstartedOrder), "PROCESSING", "Unstarted in_review order must derive as PROCESSING");

// Simulated completed report
const completedReport = {
  overallHealth: { score: 82, explanation: "Strong local brand with growth opportunities in conversion." },
  scores: { overall: 82, digitalPresence: 85, brandClarity: 80, growthReadiness: 78, conversionReadiness: 84 },
  categoryScores: {
    brandPositioning: { score: 85, summary: "Clear identity", findings: [], opportunities: [] },
    discoverabilitySeo: { score: 80, summary: "Good local presence", findings: [], opportunities: [] },
  },
  strengths: ["Strong brand awareness", "High review rating"],
  priorityRisks: ["Incomplete local citations", "Missing conversion tracking"],
  actionPlan: ["Claim and optimize Google Profile", "Set up WhatsApp instant lead capture"],
  executiveSummary: "Aurora Cafe has established strong brand goodwill across local channels.",
};

const completedOrder = {
  ...unstartedOrder,
  status: "completed" as const,
  report_data: completedReport,
};

assert.equal(hasValidAuditReport(completedOrder.report_data), true, "Completed order must have valid report data");
assert.equal(deriveAuditCustomerState(completedOrder), "DELIVERED", "Completed order must derive as DELIVERED");

console.log("✓ Audit lifecycle progression and report validation verified.");

// =========================================================================
// Test 4: Global Customer State Derivation Invariants
// =========================================================================
console.log("\nTest 4: Global Customer State Derivation Invariants...");

const freePlanSummary = resolveCustomerPlanSummary({
  plan_tier: "free",
  status: "free",
});
const freeState = deriveGlobalCustomerState({
  planSummary: freePlanSummary,
  walletBalanceCents: 0,
  activeMissionsCount: 0,
  auditStatus: "completed",
  hasReportData: true,
  connectedSourcesCount: 4,
});

assert.equal(freeState.isSubscribed, false, "Free state must have isSubscribed = false");
assert.equal(freeState.walletBalanceCents, 0, "Free state wallet must be 0");
assert.equal(freeState.activeMissionsCount, 0, "Free state active missions must be 0");
assert.equal(freeState.auditStatus, "COMPLETE", "Audit must derive as COMPLETE when report data exists");

console.log("✓ Global customer state derivation verified.");

console.log("\n=================================================================");
console.log("ALL FORENSIC END-TO-END REPAIR TESTS PASSED SUCCESSFULLY!");
console.log("=================================================================\n");
