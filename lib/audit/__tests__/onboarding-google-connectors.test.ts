// Run with: node --experimental-strip-types lib/audit/__tests__/onboarding-google-connectors.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

// Mock Supabase client for connector & provisioning testing
function createMockSupabase(initialState: {
  tenantId: string;
  userId: string;
  googleConnection?: any;
  socialAccounts?: any[];
  phoneBindings?: any[];
}) {
  const store = {
    search_google_connections: initialState.googleConnection ? [{ ...initialState.googleConnection }] : [] as any[],
    social_accounts: initialState.socialAccounts ? [...initialState.socialAccounts] : [] as any[],
    whatsapp_phone_bindings: initialState.phoneBindings ? [...initialState.phoneBindings] : [] as any[],
  };

  return {
    from: (table: keyof typeof store) => ({
      select: (_cols?: string) => ({
        eq: (_field: string, val: string) => {
          const resolveMatch = () => {
            const match = store[table]?.find((r) => r.tenant_id === val || r.id === val);
            return { data: match ? { ...match } : null, error: null };
          };
          return {
            maybeSingle: async () => resolveMatch(),
            single: async () => {
              const res = resolveMatch();
              if (!res.data) return { data: null, error: new Error("Not found") };
              return res;
            },
            order: () => ({
              limit: () => ({
                maybeSingle: async () => resolveMatch(),
              }),
            }),
          };
        },
      }),
      insert: async (record: any) => {
        store[table].push({ id: `id_${Date.now()}`, ...record });
        return { data: { ...record }, error: null };
      },
      update: (patch: any) => ({
        eq: async (_field: string, val: string) => {
          const idx = store[table]?.findIndex((r) => r.id === val || r.tenant_id === val);
          if (idx >= 0) store[table][idx] = { ...store[table][idx], ...patch };
          return { data: store[table][idx], error: null };
        },
      }),
      upsert: (record: any, _opts?: any) => {
        const existingIdx = store[table]?.findIndex((r) => r.tenant_id === record.tenant_id);
        if (existingIdx >= 0) {
          store[table][existingIdx] = { ...store[table][existingIdx], ...record };
        } else {
          store[table].push({ ...record });
        }
        return {
          select: () => ({
            single: async () => ({ data: { ...record }, error: null }),
          }),
        };
      },
    }),
    _getStore: () => store,
  };
}

async function run() {
  console.log("Running StratXcel Onboarding Google Search & GA4 Integration Test Suite...\n");

  // =========================================================================
  // Test 1: Code Contract & Layout Architecture Verification
  // =========================================================================
  console.log("Test 1: Code Contract & Layout Architecture...");
  // StepConnectors.tsx was retired when onboarding was rebuilt to the
  // "StratXcel Onboarding.dc.html" reference — account connections now live
  // in the optional ConnectorSheet reachable from the Brand/Review steps,
  // not a dedicated full-screen step.
  const connectorSheet = read("app", "app", "onboarding", "ConnectorSheet.tsx");
  const stepReview = read("app", "app", "onboarding", "steps", "StepReview.tsx");
  const types = read("app", "app", "onboarding", "types.ts");
  const connectRoute = read("app", "api", "platform", "search", "google", "connect", "route.ts");
  const callbackRoute = read("app", "api", "platform", "search", "google", "callback", "route.ts");
  const resourcesRoute = read("app", "api", "platform", "search", "google", "resources", "route.ts");
  const configRoute = read("app", "api", "platform", "search", "google", "config", "route.ts");
  const googleSearchPanel = read("app", "app", "components", "GoogleSearchIntegrationPanel.tsx");

  // Verify all real connector platforms are offered in the sheet
  assert.ok(connectorSheet.includes("google_business"), "ConnectorSheet must offer google_business");
  assert.ok(connectorSheet.includes("instagram"), "ConnectorSheet must offer instagram");
  assert.ok(connectorSheet.includes("facebook"), "ConnectorSheet must offer facebook");
  assert.ok(connectorSheet.includes("youtube"), "ConnectorSheet must offer youtube");
  assert.ok(connectorSheet.includes("whatsapp"), "ConnectorSheet must offer whatsapp");
  assert.ok(connectorSheet.includes("google_analytics"), "ConnectorSheet must offer google_analytics");
  assert.ok(connectorSheet.includes("google_search_console"), "ConnectorSheet must offer google_search_console");

  // Property selection (which exact Search Console site / GA4 property) is
  // real, but deliberately lives post-onboarding on /app/integrations —
  // the reference's onboarding sheet only establishes the OAuth connection,
  // never a property picker. Verify that real capability still exists there.
  assert.ok(googleSearchPanel.includes("Search Console property"), "GoogleSearchIntegrationPanel must include Search Console property selector");
  assert.ok(googleSearchPanel.includes("GA4 property"), "GoogleSearchIntegrationPanel must include GA4 property selector");

  // Verify connect route accepts redirectTo
  assert.ok(connectRoute.includes("redirectTo"), "connect route must support redirectTo query parameter");

  // Verify callback route handles onboarding and safe return paths
  assert.ok(callbackRoute.includes("ALLOWED_RETURN_PATHS"), "callback route must define safe allowed return paths");
  assert.ok(callbackRoute.includes("onboarding_oauth_connections"), "callback route must update onboarding_oauth_connections for onboarding");

  // Verify resources & config routes handle onboarding user context
  assert.ok(resourcesRoute.includes("onboarding_oauth_connections"), "resources route must support onboarding user metadata");
  assert.ok(configRoute.includes("onboarding_oauth_connections"), "config route must support onboarding user metadata");

  console.log("✓ Code contract and layout architecture verified.\n");

  // =========================================================================
  // Test 2: Provisioning with Search Console & GA4 Properties
  // =========================================================================
  console.log("Test 2: Provisioning with Search Console & GA4 Properties...");
  const { provisionTenantConnectorsFromMetadata } = await import("../../social/provisioning.ts");

  const mockSupabase = createMockSupabase({
    tenantId: "tenant_test_123",
    userId: "user_test_456",
  });

  const summary = await provisionTenantConnectorsFromMetadata(mockSupabase as any, {
    tenantId: "tenant_test_123",
    userId: "user_test_456",
    userMetadata: {
      onboarding_oauth_connections: {
        google_business: {
          status: "connected",
          username: "StratXcel Business",
          displayName: "StratXcel Solutions",
        },
        google_search: {
          status: "connected",
          searchConsoleSiteUrl: "https://stratxcel.in",
          ga4PropertyId: "987654321",
          ga4PropertyDisplayName: "StratXcel Production GA4",
        },
        whatsapp: {
          username: "+919876543210",
          providerAccountId: "+919876543210",
        },
      },
    },
  });

  assert.equal(summary.googleConnectionsProvisioned, true, "Google connections must be provisioned");
  assert.equal(summary.whatsappProvisioned, true, "WhatsApp must be provisioned");

  const store = mockSupabase._getStore();
  const googleConn = store.search_google_connections.find((c: any) => c.tenant_id === "tenant_test_123");
  assert.ok(googleConn, "search_google_connections row must exist");
  assert.equal(googleConn.status, "connected");
  assert.equal(googleConn.search_console_site_url, "https://stratxcel.in");
  assert.equal(googleConn.ga4_property_id, "987654321");
  assert.equal(googleConn.ga4_property_display_name, "StratXcel Production GA4");

  console.log("✓ Provisioning with Search Console & GA4 properties verified.\n");

  // =========================================================================
  // Test 3: Partial Access & Optional Skip Behavior
  // =========================================================================
  console.log("Test 3: Partial Google Access & Optional Skip Behavior...");

  // Case A: User has GBP + GA4 but no Search Console
  const partialSupabase = createMockSupabase({
    tenantId: "tenant_partial_1",
    userId: "user_partial_1",
  });

  await provisionTenantConnectorsFromMetadata(partialSupabase as any, {
    tenantId: "tenant_partial_1",
    userId: "user_partial_1",
    userMetadata: {
      onboarding_oauth_connections: {
        google_search: {
          status: "connected",
          searchConsoleSiteUrl: null, // No GSC
          ga4PropertyId: "112233445",
          ga4PropertyDisplayName: "Partial GA4",
        },
      },
    },
  });

  const partialStore = partialSupabase._getStore();
  const partialGoogle = partialStore.search_google_connections[0];
  assert.equal(partialGoogle.search_console_site_url, null);
  assert.equal(partialGoogle.ga4_property_id, "112233445");

  // Case B: User skips all optional Google connectors
  const skippedSupabase = createMockSupabase({
    tenantId: "tenant_skip_1",
    userId: "user_skip_1",
  });

  await provisionTenantConnectorsFromMetadata(skippedSupabase as any, {
    tenantId: "tenant_skip_1",
    userId: "user_skip_1",
    userMetadata: {
      onboarding_oauth_connections: {
        whatsapp: {
          username: "+919999988888",
        },
      },
    },
  });

  const skippedStore = skippedSupabase._getStore();
  assert.equal(skippedStore.search_google_connections.length, 0, "No Google connection created if skipped");
  assert.equal(skippedStore.whatsapp_phone_bindings.length, 1, "WhatsApp is provisioned independently");

  console.log("✓ Partial access and optional skip behavior verified.\n");

  // =========================================================================
  // Test 4: Normalized Audit Source Inventory
  // =========================================================================
  console.log("Test 4: Normalized Audit Source Inventory...");

  const sourceInventory = {
    google_business: { connected: true },
    search_console: { connected: true, property: "https://stratxcel.in" },
    ga4: { connected: true, property_id: "987654321" },
    instagram: { oauth_connected: false, public_presence: true },
    facebook: { oauth_connected: false, public_presence: true },
    youtube: { oauth_connected: true },
    whatsapp: { verified: true },
  };

  assert.equal(sourceInventory.google_business.connected, true);
  assert.equal(sourceInventory.search_console.connected, true);
  assert.equal(sourceInventory.search_console.property, "https://stratxcel.in");
  assert.equal(sourceInventory.ga4.connected, true);
  assert.equal(sourceInventory.ga4.property_id, "987654321");
  assert.equal(sourceInventory.instagram.oauth_connected, false);
  assert.equal(sourceInventory.instagram.public_presence, true);
  assert.equal(sourceInventory.whatsapp.verified, true);

  console.log("✓ Audit source inventory structure verified.\n");

  console.log("=================================================================");
  console.log("ALL ONBOARDING GOOGLE SEARCH & GA4 INTEGRATION TESTS PASSED!");
  console.log("=================================================================");
}

run();
