// Run with: node --experimental-strip-types lib/social/__tests__/analytics-ingestion.test.ts
//
// STRATXCEL two-gap closure brief, Gap 1: real analytics ingestion.
// Every real network/provider dependency is injected (deps.resolveAccessToken
// -> a fake provider registry) -- matches this codebase's own established
// test-provider-isolation pattern (image-cost-guard.test.ts et al): no real
// fetch, no real Supabase vault decryption, and structurally CANNOT reach a
// real billed provider. `service` is a minimal fake Supabase client, same
// convention as subscription-lifecycle.test.ts.
import assert from "node:assert/strict";
import { ingestSocialPerformanceForTenant } from "../analytics-ingestion.ts";

function fakeService(opts: {
  accounts: Array<{ id: string; platform: string }>;
  jobs: Array<{ account_id: string; variant_id: string; result: Record<string, unknown> | null; completed_at: string }>;
}) {
  const upsertCalls: Array<{ row: Record<string, unknown>; opts: Record<string, unknown> }> = [];

  function builder(table: string): any {
    const b: any = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      order() { return b; },
      gte() { return b; },
    };
    if (table === "social_accounts") {
      let eqCalls = 0;
      b.eq = () => {
        eqCalls += 1;
        return eqCalls >= 2 ? Promise.resolve({ data: opts.accounts, error: null }) : b;
      };
    } else if (table === "social_publishing_jobs") {
      b.limit = () => Promise.resolve({ data: opts.jobs, error: null });
    } else if (table === "social_metrics") {
      b.upsert = (row: Record<string, unknown>, upsertOpts: Record<string, unknown>) => {
        upsertCalls.push({ row, opts: upsertOpts });
        return Promise.resolve({ data: null, error: null });
      };
    } else {
      throw new Error(`fakeService: unexpected real table in this fake: ${table}`);
    }
    return b;
  }

  return { service: { from: (t: string) => builder(t) } as never, upsertCalls };
}

function fakeProvider(getInsights: ((accessToken: string, postId: string) => Promise<{ metrics: Record<string, number | string> }>) | undefined) {
  return { name: "fake", requiredScopes: [], getAuthorizationUrl: () => "", exchangeCodeForToken: async () => ({} as never), publish: async () => ({} as never), getInsights } as never;
}

async function testRealMetricsAreMappedAndUpserted() {
  const { service, upsertCalls } = fakeService({
    accounts: [{ id: "acct-fb", platform: "facebook" }, { id: "acct-ig", platform: "instagram" }],
    jobs: [
      { account_id: "acct-fb", variant_id: "v-fb", result: { external_post_id: "fbpost1" }, completed_at: new Date().toISOString() },
      { account_id: "acct-ig", variant_id: "v-ig", result: { external_post_id: "igpost1" }, completed_at: new Date().toISOString() },
    ],
  });
  const providers = new Map([
    ["acct-fb", fakeProvider(async () => ({ metrics: { post_impressions: 500, post_engaged_users: 40 } }))],
    ["acct-ig", fakeProvider(async () => ({ metrics: { impressions: 800, reach: 600, likes: 50, comments: 5, saved: 3 } }))],
  ]);
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async (_s, account) => ({ accessToken: "tok", provider: providers.get(account.id)! }),
  });
  assert.equal(result.attempted, 2);
  assert.equal(result.ingested, 2);
  assert.equal(result.unavailable.length, 0);
  assert.equal(upsertCalls.length, 2);
  const fbRow = upsertCalls.find((c) => c.row.variant_id === "v-fb")!;
  assert.equal(fbRow.row.impressions, 500, "post_impressions must map to the real impressions column");
  assert.equal((fbRow.row.raw as Record<string, unknown>).post_engaged_users, 40, "an unmapped-but-real metric must still survive in raw, never silently dropped");
  assert.equal(fbRow.opts.onConflict, "variant_id,observation_date", "must upsert against the real per-day idempotency key, never a plain insert");
  const igRow = upsertCalls.find((c) => c.row.variant_id === "v-ig")!;
  assert.equal(igRow.row.impressions, 800);
  assert.equal(igRow.row.reach, 600);
  assert.equal(igRow.row.likes, 50);
  assert.equal(igRow.row.comments, 5);
  assert.equal(igRow.row.saves, 3, "instagram's 'saved' key must map to the real saves column");
  console.log("analytics-ingestion.test.ts: real provider metrics are mapped to normalized columns and upserted idempotently — PASS");
}

async function testEmptyResultIsUnavailableNeverAFabricatedZero() {
  const { service, upsertCalls } = fakeService({
    accounts: [{ id: "acct-empty", platform: "facebook" }],
    jobs: [{ account_id: "acct-empty", variant_id: "v-empty", result: { external_post_id: "fbpost2" }, completed_at: new Date().toISOString() }],
  });
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async () => ({ accessToken: "tok", provider: fakeProvider(async () => ({ metrics: {} })) }),
  });
  assert.equal(result.ingested, 0);
  assert.equal(upsertCalls.length, 0, "an empty real provider result must never be stored as a fabricated zero row");
  assert.equal(result.unavailable[0]!.reason, "TEMPORARILY_UNAVAILABLE");
  console.log("analytics-ingestion.test.ts: an empty real provider result is honestly UNAVAILABLE, never stored as a fake zero — PASS");
}

async function testNotApplicableWhenProviderHasNoInsightsMethod() {
  const { service, upsertCalls } = fakeService({
    accounts: [{ id: "acct-gbp", platform: "google_business" }],
    jobs: [{ account_id: "acct-gbp", variant_id: "v-gbp", result: { external_post_id: "gbppost1" }, completed_at: new Date().toISOString() }],
  });
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async () => ({ accessToken: "tok", provider: fakeProvider(undefined) }),
  });
  assert.equal(upsertCalls.length, 0);
  assert.equal(result.unavailable[0]!.reason, "NOT_APPLICABLE");
  console.log("analytics-ingestion.test.ts: a provider with no real getInsights capability is honestly NOT_APPLICABLE — PASS");
}

async function testKnownNotAuthorizedPlatformsSkipTokenResolutionEntirely() {
  const { service } = fakeService({
    accounts: [{ id: "acct-li", platform: "linkedin" }],
    jobs: [{ account_id: "acct-li", variant_id: "v-li", result: { external_post_id: "lipost1" }, completed_at: new Date().toISOString() }],
  });
  let resolveCalls = 0;
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async () => {
      resolveCalls += 1;
      throw new Error("must never be called for a known-not-authorized platform");
    },
  });
  assert.equal(resolveCalls, 0, "a known permanent capability gap (linkedin/x) must be classified without even attempting real token resolution");
  assert.equal(result.unavailable[0]!.reason, "NOT_AUTHORIZED");
  console.log("analytics-ingestion.test.ts: a known-not-authorized platform is classified without attempting token resolution — PASS");
}

async function testBoundedRetryThenProviderErrorNeverAborts_TheWholeBatch() {
  const { service, upsertCalls } = fakeService({
    accounts: [{ id: "acct-throw", platform: "facebook" }, { id: "acct-fb", platform: "facebook" }],
    jobs: [
      { account_id: "acct-throw", variant_id: "v-throw", result: { external_post_id: "fbpost3" }, completed_at: new Date().toISOString() },
      { account_id: "acct-fb", variant_id: "v-fb", result: { external_post_id: "fbpost1" }, completed_at: new Date().toISOString() },
    ],
  });
  let throwCalls = 0;
  const providers = new Map([
    ["acct-throw", fakeProvider(async () => { throwCalls += 1; throw new Error("transient network failure"); })],
    ["acct-fb", fakeProvider(async () => ({ metrics: { likes: 10 } }))],
  ]);
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async (_s, account) => ({ accessToken: "tok", provider: providers.get(account.id)! }),
  });
  assert.equal(throwCalls, 2, "must retry exactly once (2 total attempts) on a genuine thrown/network error, never more");
  assert.equal(result.ingested, 1, "one platform's real failure must never abort the rest of the tenant's batch");
  assert.equal(upsertCalls.length, 1);
  assert.equal(result.unavailable.find((u) => u.variantId === "v-throw")!.reason, "PROVIDER_ERROR");
  console.log("analytics-ingestion.test.ts: bounded retry, then honest PROVIDER_ERROR, never aborts the rest of the real batch — PASS");
}

async function testShadowPublishesAreNeverAttempted() {
  const { service } = fakeService({
    accounts: [{ id: "acct-fb", platform: "facebook" }],
    jobs: [{ account_id: "acct-fb", variant_id: "v-shadow", result: { external_post_id: "SHADOW-abc123" }, completed_at: new Date().toISOString() }],
  });
  const result = await ingestSocialPerformanceForTenant(service, "t1", {}, {
    resolveAccessToken: async () => { throw new Error("must never be called for a shadow (non-live) publish"); },
  });
  assert.equal(result.attempted, 0, "a shadow-mode publish has no real remote post -- must never be counted as an eligible real post");
  console.log("analytics-ingestion.test.ts: a SHADOW- publish (no real remote post) is never attempted — PASS");
}

async function run() {
  await testRealMetricsAreMappedAndUpserted();
  await testEmptyResultIsUnavailableNeverAFabricatedZero();
  await testNotApplicableWhenProviderHasNoInsightsMethod();
  await testKnownNotAuthorizedPlatformsSkipTokenResolutionEntirely();
  await testBoundedRetryThenProviderErrorNeverAborts_TheWholeBatch();
  await testShadowPublishesAreNeverAttempted();
  console.log("analytics-ingestion.test.ts: ALL PASS");
}

run();
