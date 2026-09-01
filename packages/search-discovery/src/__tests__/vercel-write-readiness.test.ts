import test from "node:test";
import assert from "node:assert/strict";
import {
  createVercelCMSProvider,
  executeSearchAction,
  precheckSearchActionExecution,
} from "../execution/index.ts";
import {
  attachDomainToVercel,
  getVercelDomainStatus,
} from "../../../../packages/websites-and-domains/src/vercel-domains.ts";
import { VercelHostingProvider } from "../../../../packages/websites-and-domains/src/hosting/vercel.ts";
import { getTenantDigitalPresence } from "../../../../lib/connectors/canonical-status.ts";
import { loadIntegrationsStatusData } from "../../../../lib/connectors/load-integrations-data.ts";

// Mock Supabase DB helper
function createMockSearchDb(opts?: {
  planTier?: string;
  subscriptionStatus?: string;
  proposedChange?: string;
}) {
  const actionsMap = new Map<string, any>();
  const actions = [
    {
      id: "action-vercel-1",
      tenant_id: "tenant-prod",
      action_class: "safe_preparatory",
      state: "PROPOSED",
      execution_state: "PROPOSED",
      target_url: "https://www.stratxcel.in",
      search_recommendations: {
        id: "rec-1",
        proposed_change: {
          recommendation: opts?.proposedChange || "Add LocalBusiness schema",
          affectedUrl: "https://www.stratxcel.in",
        },
        search_opportunities: {
          id: "opp-1",
          search_projects: {
            id: "proj-1",
            name: "StratXcel",
            property_url: "https://www.stratxcel.in",
          },
        },
      },
    },
  ];
  for (const a of actions) actionsMap.set(a.id, a);

  return {
    from(table: string) {
      if (table === "search_actions") {
        return {
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  eq() {
                    return {
                      single() {
                        const item = actionsMap.get(val);
                        return Promise.resolve({ data: item || null, error: item ? null : { message: "Not found" } });
                      },
                    };
                  },
                };
              },
            };
          },
          update(updates: any) {
            return {
              eq(col: string, val: string) {
                return {
                  eq() {
                    const item = actionsMap.get(val);
                    if (item) Object.assign(item, updates);
                    return Promise.resolve({ data: item || null, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "subscriptions") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: {
                                    plan_tier: opts?.planTier || "growth",
                                    status: opts?.subscriptionStatus || "active",
                                  },
                                  error: null,
                                });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "search_opportunities" || table === "value_ledger") {
        return {
          update() { return { eq() { return { eq() { return Promise.resolve({ data: {}, error: null }); } }; } }; },
          insert() { return Promise.resolve({ data: {}, error: null }); },
        };
      }
      return {
        select() { return { eq() { return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  };
}

test("1. Read-only Vercel token correctly classified as READ_ONLY and blocks mutation", async () => {
  const readOnlyProvider = createVercelCMSProvider({
    siteUrl: "https://www.stratxcel.in",
    writeEnabled: false,
  });

  assert.equal(await readOnlyProvider.status(), "READ_ONLY");

  await assert.rejects(async () => {
    await readOnlyProvider.updateMetadata("https://www.stratxcel.in", { title: "New Title" });
  }, /EXTERNAL_PERMISSION_REQUIRED/);

  await assert.rejects(async () => {
    await readOnlyProvider.updateSchema("https://www.stratxcel.in", { "@type": "LocalBusiness" });
  }, /EXTERNAL_PERMISSION_REQUIRED/);
});

test("2. Write-authorized Vercel credential classified as WRITE_AVAILABLE and executes mutation", async () => {
  let deployed = false;
  const writeProvider = createVercelCMSProvider({
    siteUrl: "https://www.stratxcel.in",
    writeEnabled: true,
    onDeploy: async () => {
      deployed = true;
      return { success: true, deployedUrl: "https://www.stratxcel.in" };
    },
  });

  assert.equal(await writeProvider.status(), "WRITE_AVAILABLE");

  const metaResult = await writeProvider.updateMetadata("https://www.stratxcel.in", {
    title: "StratXcel — AI Autonomous Growth Platform",
    description: "Enterprise autonomous marketing, SEO, and sales operating system.",
  });

  assert.equal(metaResult.success, true);
  assert.equal(metaResult.targetUrl, "https://www.stratxcel.in");
  assert.equal(deployed, true);

  const verification = await writeProvider.verifyPage("https://www.stratxcel.in", {
    expectedTitle: "StratXcel — AI Autonomous Growth Platform",
    expectedMetaDescription: "Enterprise autonomous marketing",
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.httpStatus, 200);
});

test("3. Team access: Vercel REST endpoints include teamId query parameter", async () => {
  const calls: string[] = [];
  const mockFetch = async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    calls.push(urlStr);
    return new Response(JSON.stringify({ name: "stratxcel.in", verified: true, certs: [{ id: "c1" }] }), { status: 200 });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    await attachDomainToVercel("stratxcel.in", "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ", "vcl_token_test", "team_UWCzHaOLdAOtezWqRxYNxdYf");
    await getVercelDomainStatus("stratxcel.in", "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ", "vcl_token_test", "team_UWCzHaOLdAOtezWqRxYNxdYf");

    assert.ok(calls.length >= 2);
    assert.ok(calls[0].includes("teamId=team_UWCzHaOLdAOtezWqRxYNxdYf"), `Expected teamId in attach call: ${calls[0]}`);
    assert.ok(calls[1].includes("teamId=team_UWCzHaOLdAOtezWqRxYNxdYf"), `Expected teamId in status call: ${calls[1]}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("4. Domain matching: canonical domains stratxcel.in and www.stratxcel.in verified", async () => {
  const precheckPass = precheckSearchActionExecution({
    tenantId: "tenant-prod",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update meta title",
    connectorStatus: { isHealthy: true, writeEnabled: true, cmsType: "vercel" },
    targetDomainMatch: true,
  });
  assert.equal(precheckPass.allowed, true);

  const precheckMismatch = precheckSearchActionExecution({
    tenantId: "tenant-prod",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Update meta title",
    connectorStatus: { isHealthy: true, writeEnabled: true, cmsType: "vercel" },
    targetDomainMatch: false,
  });
  assert.equal(precheckMismatch.allowed, false);
  assert.equal(precheckMismatch.blockerCode, "TARGET_DOMAIN_MISMATCH");
});

test("5. End-to-end SEO Execution Flow (Finding → Action → Validate → Change → Build → Deploy → Crawl → Verify)", async () => {
  const db = createMockSearchDb({ planTier: "growth", proposedChange: "Add LocalBusiness schema" });
  const vercelCMS = createVercelCMSProvider({
    siteUrl: "https://www.stratxcel.in",
    writeEnabled: true,
  });

  const result = await executeSearchAction(
    { db: db as any, cmsProvider: vercelCMS },
    { tenantId: "tenant-prod", actionId: "action-vercel-1" }
  );

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.targetUrl, "https://www.stratxcel.in");
  assert.ok(result.beforeEvidence);
  assert.ok(result.afterEvidence);
  assert.ok(result.verificationResult);
});

test("6. Independent Analysis: Website analysis, SEO, AEO, GEO, GSC continue working even with Read-Only Vercel access", async () => {
  // Precheck blocks execution if read-only, but analysis is preserved
  const precheckReadOnly = precheckSearchActionExecution({
    tenantId: "tenant-prod",
    planTier: "growth",
    subscriptionStatus: "active",
    actionClass: "safe_preparatory",
    proposedChange: "Add LocalBusiness schema",
    connectorStatus: { isHealthy: true, writeEnabled: false, cmsType: "vercel" },
  });

  assert.equal(precheckReadOnly.allowed, false);
  assert.equal(precheckReadOnly.blockerCode, "CONNECTOR_READ_ONLY");
  assert.ok(precheckReadOnly.blockerReason?.includes("read permission"));
});

test("7. Customer UI and Canonical Presence shows clean connection without internal diagnostics", async () => {
  const mockService: any = {
    from(table: string) {
      if (table === "whatsapp_phone_bindings") return { select() { return { eq() { return { order() { return Promise.resolve({ data: [] }); } }; } }; } };
      if (table === "social_accounts") return { select() { return { eq() { return Promise.resolve({ data: [] }); } }; } };
      if (table === "search_google_connections") return { select() { return { eq() { return { maybeSingle() { return Promise.resolve({ data: null }); } }; } }; } };
      return { select() { return Promise.resolve({ data: [] }); } };
    },
  };

  const summary = await getTenantDigitalPresence(mockService, "tenant-prod");
  assert.equal(summary.connections.website.connectionState, "CONNECTED");
  assert.equal(summary.connections.website.platform, "nextjs");
  assert.equal(summary.connections.website.projectName, "stratxcel");
  assert.ok(summary.connections.website.publicUrl?.includes("stratxcel.in"));

  const customerData = await loadIntegrationsStatusData(mockService, "tenant-prod", "owner");
  assert.equal(customerData.website?.platform, "nextjs");
  assert.equal(customerData.website?.vercelProject, "stratxcel");
  assert.equal(customerData.website?.vercelStatus, "READY");
  assert.equal(customerData.website?.writeCapability, "READ_ONLY");
});

test("8. Canonical resolveVercelWriteCapability: Truthful state resolution across DB, UI, and Execution", async () => {
  const { resolveVercelWriteCapability } = await import("../execution/cms/vercel-write-resolver.ts");

  // A. Public discovered site without write token -> READ_ONLY
  const readOnlyRes = await resolveVercelWriteCapability({
    tenantId: "tenant-read-only",
    siteUrl: "https://www.stratxcel.in",
  });
  assert.equal(readOnlyRes.state, "READ_ONLY");
  assert.equal(readOnlyRes.writeEnabled, false);
  assert.equal(readOnlyRes.canMutate, false);
  assert.equal(readOnlyRes.customerUiCopy.connectionBadge, "Connected · Read-only");
  assert.equal(readOnlyRes.customerUiCopy.automaticChangesLabel, "Connect Vercel with write access");

  // B. Database with write_enabled: true -> WRITE_READY
  const mockDbWithWrite: any = {
    from(table: string) {
      if (table === "search_cms_connections") {
        return {
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  in() {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              maybeSingle() {
                                if (val === "tenant-write-ready") {
                                  return Promise.resolve({
                                    data: {
                                      tenant_id: "tenant-write-ready",
                                      cms_type: "vercel",
                                      site_url: "https://www.stratxcel.in",
                                      write_enabled: true,
                                      is_healthy: true,
                                    },
                                    error: null,
                                  });
                                }
                                return Promise.resolve({ data: null, error: null });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      return { select() { return Promise.resolve({ data: [] }); } };
    },
  };

  const writeRes = await resolveVercelWriteCapability({
    tenantId: "tenant-write-ready",
    db: mockDbWithWrite,
    siteUrl: "https://www.stratxcel.in",
  });
  assert.equal(writeRes.state, "WRITE_READY");
  assert.equal(writeRes.writeEnabled, true);
  assert.equal(writeRes.canMutate, true);
  assert.equal(writeRes.customerUiCopy.automaticChangesLabel, "✓ Ready");

  // C. Tenant Isolation: Another tenant querying DB without connection receives READ_ONLY
  const isolatedRes = await resolveVercelWriteCapability({
    tenantId: "tenant-isolated-other",
    db: mockDbWithWrite,
    siteUrl: "https://www.stratxcel.in",
  });
  assert.equal(isolatedRes.state, "READ_ONLY");
  assert.equal(isolatedRes.writeEnabled, false);
});

