// Run with: node --experimental-strip-types lib/social/__tests__/image-cost-guard.test.ts
//
// STRATXCEL zero-waste image-spend brief Section 6: a real, same-day
// image-spend circuit breaker, additive to the existing monthly AI-COGS
// budget gate. Tests the real threshold math and fail-open/fail-closed
// behavior against a minimal fake Supabase client -- no live provider
// call, no real spend, matching this codebase's own established
// dependency-injection test-isolation pattern.
import assert from "node:assert/strict";
import { checkDailyImageSpendLimit } from "../image-cost-guard.ts";

function fakeService(opts: { planTier: string | null; todaysCosts: number[]; ledgerError?: string }) {
  return {
    from(table: string) {
      if (table === "subscriptions") {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() { return { data: opts.planTier ? { plan_tier: opts.planTier } : null, error: null }; },
        };
      }
      if (table === "ai_execution_usage") {
        return {
          select() { return this; },
          eq() { return this; },
          async gte() {
            if (opts.ledgerError) return { data: null, error: { message: opts.ledgerError } };
            return { data: opts.todaysCosts.map((c) => ({ estimated_cost_usd: c })), error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as never;
}

// Real business tier (advanced_growth maps here per the earlier
// resolveTenantPlanTier fix) has a $36.7 real monthly budget ->
// threshold = 36.7 * 0.25 = $9.175.
async function testUnderThresholdAllowsGeneration() {
  const service = fakeService({ planTier: "advanced_growth", todaysCosts: [0.422, 0.422, 0.422] }); // $1.266
  const result = await checkDailyImageSpendLimit(service, "t1");
  assert.equal(result.allowed, true);
  assert.ok(result.spentTodayUsd < result.thresholdUsd);
  assert.equal(result.reason, null);
  console.log("image-cost-guard.test.ts: real spend under the real threshold allows generation — PASS");
}

async function testAtOrOverThresholdBlocksGeneration() {
  // 22 real calls x $0.422 = $9.284, over the real $9.175 business-tier threshold.
  const costs = Array(22).fill(0.422);
  const service = fakeService({ planTier: "advanced_growth", todaysCosts: costs });
  const result = await checkDailyImageSpendLimit(service, "t1");
  assert.equal(result.allowed, false, `expected the real threshold to be reached (spent=${result.spentTodayUsd}, threshold=${result.thresholdUsd})`);
  assert.ok(result.reason && result.reason.includes("circuit-breaker"), "must carry a real, specific reason");
  console.log("image-cost-guard.test.ts: real spend at/over the real threshold blocks further generation — PASS");
}

async function testThresholdIsDerivedFromRealPlanBudgetNotHardcoded() {
  const starter = await checkDailyImageSpendLimit(fakeService({ planTier: "seo", todaysCosts: [] }), "t1"); // maps to starter
  const business = await checkDailyImageSpendLimit(fakeService({ planTier: "advanced_growth", todaysCosts: [] }), "t1"); // maps to business
  assert.ok(business.thresholdUsd > starter.thresholdUsd, "a real higher-tier tenant must get a real higher threshold, derived from its own resolved plan -- never one flat number for every tenant");
  console.log("image-cost-guard.test.ts: the real threshold is derived per-tenant from its own resolved plan budget, not a hardcoded constant — PASS");
}

async function testLedgerReadErrorFailsOpenWithAReason() {
  const service = fakeService({ planTier: "advanced_growth", todaysCosts: [], ledgerError: "simulated: table unreachable" });
  const result = await checkDailyImageSpendLimit(service, "t1");
  assert.equal(result.allowed, true, "an unreadable safety table must not itself become an outage -- fails open");
  assert.ok(result.reason && result.reason.includes("unreadable"), "the fail-open reason must be real and specific, not silently swallowed");
  console.log("image-cost-guard.test.ts: a real ledger read failure fails open (never blocks real generation) but is never silently swallowed — PASS");
}

async function testNeverThrows() {
  const throwingService = { from() { throw new Error("simulated total failure"); } } as never;
  const result = await checkDailyImageSpendLimit(throwingService, "t1");
  assert.equal(result.allowed, true);
  console.log("image-cost-guard.test.ts: a total failure anywhere in the check never throws into the real generation it guards — PASS");
}

async function run() {
  await testUnderThresholdAllowsGeneration();
  await testAtOrOverThresholdBlocksGeneration();
  await testThresholdIsDerivedFromRealPlanBudgetNotHardcoded();
  await testLedgerReadErrorFailsOpenWithAReason();
  await testNeverThrows();
  console.log("image-cost-guard.test.ts: ALL PASS");
}

run();
