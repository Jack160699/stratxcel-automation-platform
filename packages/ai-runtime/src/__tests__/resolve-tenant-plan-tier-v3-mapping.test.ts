// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/resolve-tenant-plan-tier-v3-mapping.test.ts
//
// Real defect found live during the StratXcel platform-closure session:
// resolveTenantPlanTier only recognized the legacy growth/business/scale/
// custom tiers for AI-COGS budget purposes -- every real v3 self-service
// tier (including StratXcel's own active advanced_growth) silently fell
// through to "starter", the cheapest budget bucket. Fixed via
// V3_TIER_TO_LEGACY_BUDGET_BUCKET (nearest-real-price classification,
// no invented dollar figures). This test locks in the real mapping.
import assert from "node:assert/strict";
import { resolveTenantPlanTier } from "../factory.ts";

function fakeService(planTier: string | undefined) {
  return {
    from(table: string) {
      assert.equal(table, "subscriptions");
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() { return { data: planTier == null ? null : { plan_tier: planTier }, error: null }; },
      };
    },
  } as never;
}

async function testEachRealV3TierMapsToItsNearestPriceLegacyBucket() {
  const expected: Record<string, string> = {
    seo: "starter",
    social: "starter",
    seo_and_social: "growth",
    advanced_seo: "growth",
    advanced_social: "growth",
    advanced_growth: "business",
  };
  for (const [tier, bucket] of Object.entries(expected)) {
    const result = await resolveTenantPlanTier(fakeService(tier), "t1");
    assert.equal(result, bucket, `expected v3 tier "${tier}" to map to AI-budget bucket "${bucket}", got "${result}"`);
  }
  console.log("resolve-tenant-plan-tier-v3-mapping.test.ts: every real v3 tier maps to its nearest-by-price legacy budget bucket, not a blind starter default — PASS");
}

async function testLegacyTiersStillPassThroughUnchanged() {
  for (const tier of ["growth", "business", "scale"]) {
    const result = await resolveTenantPlanTier(fakeService(tier), "t1");
    assert.equal(result, tier, `expected legacy tier "${tier}" to pass through unchanged`);
  }
  console.log("resolve-tenant-plan-tier-v3-mapping.test.ts: legacy tiers still pass through unchanged (no regression) — PASS");
}

async function testUnknownOrMissingTierStillFailsClosedToStarter() {
  const missing = await resolveTenantPlanTier(fakeService(undefined), "t1");
  assert.equal(missing, "starter", "no active subscription must still fail closed to the cheapest budget");
  const unknown = await resolveTenantPlanTier(fakeService("some_future_tier_not_yet_mapped"), "t1");
  assert.equal(unknown, "starter", "a genuinely unrecognized tier must still fail closed, never crash or invent a bucket");
  console.log("resolve-tenant-plan-tier-v3-mapping.test.ts: missing/unrecognized tiers still fail closed to starter, never crash — PASS");
}

async function run() {
  await testEachRealV3TierMapsToItsNearestPriceLegacyBucket();
  await testLegacyTiersStillPassThroughUnchanged();
  await testUnknownOrMissingTierStillFailsClosedToStarter();
  console.log("resolve-tenant-plan-tier-v3-mapping.test.ts: ALL PASS");
}

run();
