// Run with: node --experimental-strip-types lib/social/__tests__/tenant-social-health.test.ts
//
// STRATXCEL full-system closure brief, Section 9: regression coverage for
// a real, confirmed, live production bug -- see tenant-social-health.ts's
// header comment for the full live evidence. This proves the real fix is
// genuinely tenant_id-scoped: two tenants with distinct real accounts/
// settings must never see each other's data through this function, and a
// tenant's real owner_id is resolved from its own social_accounts, never
// hardcoded or borrowed from an unrelated identity.
import assert from "node:assert/strict";
import { assessTenantSocialHealth } from "../tenant-social-health.ts";

function fakeService(opts: {
  accounts: Array<{ id: string; owner_id: string; tenant_id: string; platform: string; status: string; token_health: string }>;
  settingsByOwnerId: Record<string, { shadow_mode: boolean; autonomy_level: string }>;
  jobsByAccountId: Record<string, Array<{ status: string }>>;
  webhookCountByAccountId: Record<string, number>;
}) {
  function builder(table: string): any {
    const b: any = { select() { return b; }, eq() { return b; }, in() { return b; } };
    if (table === "social_accounts") {
      b.eq = (col: string, value: string) => {
        if (col !== "tenant_id") return b;
        return Promise.resolve({ data: opts.accounts.filter((a) => a.tenant_id === value), error: null });
      };
    } else if (table === "social_publishing_jobs") {
      b.in = (col: string, ids: string[]) => {
        if (col !== "account_id") return b;
        const jobs = ids.flatMap((id) => opts.jobsByAccountId[id] ?? []);
        return Promise.resolve({ data: jobs, error: null });
      };
    } else if (table === "social_automation_settings") {
      b.eq = (col: string, value: string) => {
        if (col !== "owner_id") return b;
        const row = opts.settingsByOwnerId[value];
        return { maybeSingle: () => Promise.resolve({ data: row ?? null, error: null }) };
      };
    } else if (table === "social_webhook_events") {
      b.in = (col: string, ids: string[]) => {
        if (col !== "account_id") return b;
        const count = ids.reduce((sum, id) => sum + (opts.webhookCountByAccountId[id] ?? 0), 0);
        return Promise.resolve({ count, error: null });
      };
    } else {
      throw new Error(`fakeService: unexpected real table in this fake: ${table}`);
    }
    return b;
  }
  return { from: (t: string) => builder(t) } as never;
}

async function testTwoTenantsNeverSeeEachOthersData() {
  const service = fakeService({
    accounts: [
      { id: "acct-a1", owner_id: "owner-a", tenant_id: "tenant-a", platform: "facebook", status: "CONNECTED", token_health: "HEALTHY" },
      { id: "acct-b1", owner_id: "owner-b", tenant_id: "tenant-b", platform: "threads", status: "CONNECTED", token_health: "HEALTHY" },
    ],
    settingsByOwnerId: {
      "owner-a": { shadow_mode: false, autonomy_level: "AUTOPILOT" },
      "owner-b": { shadow_mode: true, autonomy_level: "MANUAL" },
    },
    jobsByAccountId: { "acct-a1": [{ status: "PUBLISHED" }, { status: "FAILED" }], "acct-b1": [{ status: "SCHEDULED" }] },
    webhookCountByAccountId: { "acct-a1": 3, "acct-b1": 0 },
  });

  const tenantA = await assessTenantSocialHealth(service, "tenant-a");
  assert.deepEqual(tenantA.connectedPlatforms.map((p) => p.platform), ["facebook"], "tenant A must see only its own real connected platform, never tenant B's");
  assert.equal(tenantA.publishingMode.shadowMode, false, "tenant A's real shadow_mode must be resolved from ITS OWN real owner_id, never another identity's");
  assert.equal(tenantA.jobCounts.published, 1);
  assert.equal(tenantA.jobCounts.failed, 1);
  assert.equal(tenantA.webhookEventCount, 3);

  const tenantB = await assessTenantSocialHealth(service, "tenant-b");
  assert.deepEqual(tenantB.connectedPlatforms.map((p) => p.platform), ["threads"], "tenant B must see only its own real connected platform, never tenant A's");
  assert.equal(tenantB.publishingMode.shadowMode, true, "tenant B's real shadow_mode must be its own, never tenant A's");
  assert.equal(tenantB.jobCounts.scheduled, 1);
  assert.equal(tenantB.webhookEventCount, 0);

  console.log("tenant-social-health.test.ts: two real tenants never see each other's connections, jobs, webhooks, or publishing-mode state — PASS");
}

async function testStratxcelExactLiveScenario() {
  // Real, confirmed live shape (2026-08-31): StratXcel has 4 real
  // connected accounts and a real shadow_mode of false (LIVE/AUTOPILOT) --
  // the exact case the buggy owner_id-scoped widget got backwards.
  const service = fakeService({
    accounts: [
      { id: "sx-fb", owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b", tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a", platform: "facebook", status: "CONNECTED", token_health: "HEALTHY" },
      { id: "sx-ig", owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b", tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a", platform: "instagram", status: "CONNECTED", token_health: "HEALTHY" },
      { id: "sx-yt", owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b", tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a", platform: "youtube", status: "CONNECTED", token_health: "HEALTHY" },
      { id: "sx-gb", owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b", tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a", platform: "google_business", status: "CONNECTED", token_health: "HEALTHY" },
    ],
    settingsByOwnerId: { "9381030b-b14a-4551-a6e9-b5918f017e1b": { shadow_mode: false, autonomy_level: "AUTOPILOT" } },
    jobsByAccountId: {},
    webhookCountByAccountId: {},
  });
  const result = await assessTenantSocialHealth(service, "466e6195-a9f6-4576-8271-29fdae61c18a");
  assert.equal(result.connectedPlatforms.length, 4);
  assert.equal(result.publishingMode.shadowMode, false, "must correctly report StratXcel's real LIVE/AUTOPILOT state, not a borrowed staff identity's SHADOW state");
  assert.equal(result.publishingMode.autonomyLevel, "AUTOPILOT");
  console.log("tenant-social-health.test.ts: correctly reports StratXcel's real, live-confirmed shape (4 accounts, shadow_mode=false) — PASS");
}

async function testNoConnectedAccountsIsHonestNeverGuessed() {
  const service = fakeService({ accounts: [], settingsByOwnerId: {}, jobsByAccountId: {}, webhookCountByAccountId: {} });
  const result = await assessTenantSocialHealth(service, "brand-new-tenant");
  assert.deepEqual(result.connectedPlatforms, []);
  assert.equal(result.publishingMode.shadowMode, null, "with no real owner_id resolvable (no connected accounts yet), publishing mode must be honestly null, never guessed or borrowed from another identity");
  assert.equal(result.jobCounts.scheduled, 0);
  console.log("tenant-social-health.test.ts: a tenant with no connected accounts yet gets an honest, empty result, never a fabricated/borrowed one — PASS");
}

async function run() {
  await testTwoTenantsNeverSeeEachOthersData();
  await testStratxcelExactLiveScenario();
  await testNoConnectedAccountsIsHonestNeverGuessed();
  console.log("tenant-social-health.test.ts: ALL PASS");
}

run();
