// Run with: node --experimental-strip-types lib/social/__tests__/image-provider-health.test.ts
//
// STRATXCEL zero-waste image-spend brief Section 7: real image-provider
// health visibility, derived from the real usage ledger (never a live
// provider call, never fabricated). Tests against a fake Supabase client.
import assert from "node:assert/strict";
import { assessImageProviderHealth } from "../image-provider-health.ts";

function fakeService(rows: Array<{ provider: string; fallback_used: boolean; success: boolean; estimated_cost_usd: number; media_units: number }> | { error: string }) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async gte() {
          if (!Array.isArray(rows)) return { data: null, error: { message: rows.error } };
          return { data: rows, error: null };
        },
      };
    },
  } as never;
}

async function testAllPrimarySuccessIsHealthy() {
  const service = fakeService([
    { provider: "google", fallback_used: false, success: true, estimated_cost_usd: 0.05, media_units: 1 },
    { provider: "google", fallback_used: false, success: true, estimated_cost_usd: 0.05, media_units: 1 },
  ]);
  const result = await assessImageProviderHealth(service, "t1");
  assert.equal(result.status, "PRIMARY_HEALTHY");
  assert.equal(result.fallbackRate, 0);
  console.log("image-provider-health.test.ts: all real primary successes -> PRIMARY_HEALTHY — PASS");
}

// This is the REAL, live-observed StratXcel case: 26 of 26 real successful
// calls this period used the fallback, zero primary successes.
async function testAllFallbackIsFallbackActive() {
  const rows = Array.from({ length: 26 }, () => ({ provider: "openai", fallback_used: true, success: true, estimated_cost_usd: 0.422, media_units: 2 }));
  const service = fakeService(rows);
  const result = await assessImageProviderHealth(service, "t1");
  assert.equal(result.status, "FALLBACK_ACTIVE");
  assert.equal(result.fallbackRate, 1);
  assert.equal(result.observedCostMultiplier, null, "with zero real primary successes to compare against, the cost multiplier must be honestly null, never invented");
  assert.ok(result.message.includes("100%"), "the message must state the real observed fallback rate plainly");
  console.log("image-provider-health.test.ts: the real live-observed StratXcel case (26/26 fallback, 0 primary successes) reports FALLBACK_ACTIVE with an honest null cost multiplier — PASS");
}

async function testMixedIsDegraded() {
  const rows = [
    { provider: "google", fallback_used: false, success: true, estimated_cost_usd: 0.05, media_units: 1 },
    { provider: "openai", fallback_used: true, success: true, estimated_cost_usd: 0.422, media_units: 2 },
    { provider: "openai", fallback_used: true, success: true, estimated_cost_usd: 0.422, media_units: 2 },
  ];
  const service = fakeService(rows);
  const result = await assessImageProviderHealth(service, "t1");
  assert.equal(result.status, "PRIMARY_DEGRADED");
  assert.ok(result.fallbackRate! > 0 && result.fallbackRate! < 1);
  console.log("image-provider-health.test.ts: a real mix of primary/fallback successes -> PRIMARY_DEGRADED — PASS");
}

async function testCostMultiplierComputedOnlyWhenBothProvidersObserved() {
  const rows = [
    { provider: "google", fallback_used: false, success: true, estimated_cost_usd: 0.10, media_units: 1 }, // $0.10/unit
    { provider: "openai", fallback_used: true, success: true, estimated_cost_usd: 0.422, media_units: 2 }, // $0.211/unit
  ];
  const service = fakeService(rows);
  const result = await assessImageProviderHealth(service, "t1");
  assert.ok(result.observedCostMultiplier !== null, "with a real observed call on each provider, the multiplier must be a real, computed number");
  assert.ok(Math.abs(result.observedCostMultiplier! - 2.11) < 0.01, `expected a real ~2.11x multiplier (0.211/0.10), got ${result.observedCostMultiplier}`);
  console.log("image-provider-health.test.ts: the real cost multiplier is computed only from real observed per-provider costs, never guessed — PASS");
}

async function testNoDataIsHonest() {
  const result = await assessImageProviderHealth(fakeService([]), "t1");
  assert.equal(result.status, "NO_RECENT_DATA");
  assert.equal(result.fallbackRate, null);
  console.log("image-provider-health.test.ts: zero real calls in the window -> honest NO_RECENT_DATA, never a fabricated healthy/unhealthy verdict — PASS");
}

async function testLedgerErrorIsHonest() {
  const result = await assessImageProviderHealth(fakeService({ error: "simulated: table unreachable" }), "t1");
  assert.equal(result.status, "NO_RECENT_DATA");
  assert.ok(result.message.includes("unreadable"));
  console.log("image-provider-health.test.ts: a real ledger read error is reported honestly, never silently treated as healthy — PASS");
}

async function run() {
  await testAllPrimarySuccessIsHealthy();
  await testAllFallbackIsFallbackActive();
  await testMixedIsDegraded();
  await testCostMultiplierComputedOnlyWhenBothProvidersObserved();
  await testNoDataIsHonest();
  await testLedgerErrorIsHonest();
  console.log("image-provider-health.test.ts: ALL PASS");
}

run();
