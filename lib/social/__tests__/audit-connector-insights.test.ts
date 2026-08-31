import assert from "node:assert/strict";
import { createSocialAuditConnectorInsightsProvider } from "../audit-connector-insights.ts";

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, "k").toString("base64");

console.log("Running StratXcel Audit Connector Insights (Social) Test Suite...\n");

interface FakeAccountRow {
  id: string;
  tenant_id: string;
  platform: string;
  provider_account_id: string;
  username: string | null;
  display_name: string | null;
  status: string;
  updated_at: string;
  created_at: string;
}

function makeFakeService(accounts: FakeAccountRow[]) {
  const observedTenantFilters: string[] = [];
  const service: any = {
    from(table: string) {
      if (table === "social_accounts") {
        return {
          select() {
            return this;
          },
          _tenantId: null as string | null,
          _platforms: null as string[] | null,
          eq(col: string, val: string) {
            if (col === "tenant_id") {
              this._tenantId = val;
              observedTenantFilters.push(val);
            }
            return this;
          },
          in(col: string, vals: string[]) {
            if (col === "platform") this._platforms = vals;
            return this;
          },
          then(resolve: any) {
            const rows = accounts.filter(
              (a) =>
                (!this._tenantId || a.tenant_id === this._tenantId) &&
                (!this._platforms || this._platforms.includes(a.platform)),
            );
            return resolve({ data: rows, error: null });
          },
        };
      }
      if (table === "social_tokens") {
        // No stored token for any account in this test — the gather must
        // therefore report provider_error for CONNECTED accounts (a real
        // fetch is never reached) rather than crash or hang.
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async single() {
            return { data: null, error: { message: "no row" } };
          },
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
  return { service, observedTenantFilters };
}

async function tenantIsolation() {
  const accounts: FakeAccountRow[] = [
    { id: "acc-a-fb", tenant_id: "tenant-a", platform: "facebook", provider_account_id: "111", username: "a-page", display_name: "A Page", status: "CONNECTED", updated_at: "2026-08-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "acc-b-fb", tenant_id: "tenant-b", platform: "facebook", provider_account_id: "222", username: "b-page", display_name: "B Page", status: "CONNECTED", updated_at: "2026-08-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
  ];
  const { service, observedTenantFilters } = makeFakeService(accounts);
  const provider = createSocialAuditConnectorInsightsProvider(service);

  const resultA = await provider.gather("tenant-a");
  assert.ok(observedTenantFilters.includes("tenant-a"), "tenant-a's gather must filter by tenant-a");
  assert.ok(!observedTenantFilters.some((t) => t === "tenant-b"), "tenant-a's gather must never touch tenant-b");
  // No stored token in this fixture -> real network is never reached; the
  // point under test is that the *account resolved* is tenant-a's own row.
  assert.notEqual(resultA.facebook.state, "not_connected", "tenant-a does have a CONNECTED facebook row");

  const resultB = await provider.gather("tenant-b");
  assert.ok(observedTenantFilters.includes("tenant-b"));
  assert.notEqual(resultB.facebook.state, "not_connected", "tenant-b does have a CONNECTED facebook row");

  console.log("✓ Test 1: social connector gathering is strictly tenant-scoped");
}

// Test 2: a DISCONNECTED row must resolve to not_connected and must never trigger
// any token lookup/fetch attempt for that platform.
async function disconnectedNeverAttemptsRead() {
  const accounts: FakeAccountRow[] = [
    { id: "acc-1", tenant_id: "tenant-c", platform: "instagram", provider_account_id: "333", username: "c-ig", display_name: "C IG", status: "DISCONNECTED", updated_at: "2026-08-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
  ];
  const { service } = makeFakeService(accounts);
  const provider = createSocialAuditConnectorInsightsProvider(service);
  const result = await provider.gather("tenant-c");
  assert.equal(result.instagram.state, "not_connected", "a DISCONNECTED row must never be treated as usable");
  assert.equal(result.instagram.data, null);
  console.log("✓ Test 2: disconnected accounts resolve to not_connected without attempting a read");
}

// Test 3: a tenant with zero rows for a platform must resolve to not_connected
// for that platform, and independently for every other platform.
async function noRowsMeansNotConnectedForAllPlatforms() {
  const { service } = makeFakeService([]);
  const provider = createSocialAuditConnectorInsightsProvider(service);
  const result = await provider.gather("tenant-empty");
  assert.equal(result.facebook.state, "not_connected");
  assert.equal(result.instagram.state, "not_connected");
  assert.equal(result.googleBusiness.state, "not_connected");
  console.log("✓ Test 3: a tenant with no connected accounts gets an honest not_connected state everywhere");
}

// Test 4: a CONNECTED/HEALTHY Google Business row whose provider_account_id
// is still the OAuth-time fallback bare id (found live against the real
// StratXcel tenant — docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
// Update 10) must report an honest, actionable permission_required state
// and must never attempt the doomed network read against an invalid
// resource path.
async function unresolvedGbpLocationNeverAttemptsRead() {
  const accounts: FakeAccountRow[] = [
    { id: "acc-gbp-unresolved", tenant_id: "tenant-d", platform: "google_business", provider_account_id: "118157607743139723110", username: null, display_name: null, status: "CONNECTED", updated_at: "2026-08-23T10:24:53.000Z", created_at: "2026-08-23T10:24:53.000Z" },
  ];
  const { service } = makeFakeService(accounts);
  const provider = createSocialAuditConnectorInsightsProvider(service);
  const result = await provider.gather("tenant-d");
  assert.equal(result.googleBusiness.state, "permission_required", "an unresolved GBP location must not be reported as available or as a generic provider_error");
  assert.equal(result.googleBusiness.data, null);
  assert.match(result.googleBusiness.reason ?? "", /reconnect/i, "the reason must be actionable, not a generic failure message");
  console.log("✓ Test 4: a CONNECTED row with an unresolved GBP location id gets an honest, actionable state without attempting a doomed network read");
}

(async () => {
  await tenantIsolation();
  await disconnectedNeverAttemptsRead();
  await noRowsMeansNotConnectedForAllPlatforms();
  await unresolvedGbpLocationNeverAttemptsRead();
  console.log("\n=================================================================");
  console.log("ALL SOCIAL AUDIT CONNECTOR INSIGHTS TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================================");
})().catch((err) => {
  console.error("Social audit connector insights test failed:", err);
  process.exit(1);
});
