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
        return {
          select(_cols?: string) {
            return {
              eq(col1: string, val1: any) {
                return {
                  eq(col2: string, val2: any) {
                    return {
                      async maybeSingle() {
                        const found = socialAccounts.find((r) => r[col1] === val1 && r[col2] === val2);
                        return { data: found || null, error: null };
                      },
                    };
                  },
                  async maybeSingle() {
                    const found = socialAccounts.find((r) => r[col1] === val1);
                    return { data: found || null, error: null };
                  },
                };
              },
            };
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
assert.ok(accounts.some((a: any) => a.platform === "instagram" && a.status === "CONNECTED"), "Instagram must be CONNECTED");
assert.ok(accounts.some((a: any) => a.platform === "facebook" && a.status === "CONNECTED"), "Facebook must be CONNECTED");
assert.ok(accounts.some((a: any) => a.platform === "youtube" && a.status === "CONNECTED"), "YouTube must be CONNECTED");

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
