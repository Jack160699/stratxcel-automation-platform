// Run with: node --experimental-strip-types lib/social/__tests__/market-intelligence.test.ts
//
// STRATXCEL Master Execution Prompt Sections 16-17: real, grounded
// competitor/social-trend research. gatherLiveMarketIntelligence wires
// together several real, external, billable dependencies
// (@stratxcel/ai-runtime's usage ledger + AI Runtime factory,
// @stratxcel/search-discovery's grounded research engine) -- consistent
// with this codebase's own documented pattern for that engine
// (docs/architecture/RESEARCH_ENGINE_V1.md: "Default tests: fake HTTP
// only... Optional: RESEARCH_LIVE_SMOKE_TEST=1... not run in this
// workstream"), this suite tests the one thing safely testable without a
// live, billed network call: that a failure ANYWHERE inside this chain
// (usage ledger unreachable, AI Runtime misconfigured, a thrown
// exception) is always converted into an honest `available: false`
// result with a real reason, NEVER a thrown exception escaping into the
// real content-generation pipeline that calls this best-effort.
import assert from "node:assert/strict";
import { gatherLiveMarketIntelligence } from "../market-intelligence.ts";

async function testAnyInternalFailureNeverThrowsAndIsHonest() {
  // A writeClient whose very first call throws -- simulates any of the
  // several real failure modes inside the chain (network down, ledger
  // table missing, credentials misconfigured) without needing to
  // reverse-engineer the exact real query shape of every dependency.
  const throwingClient = {
    from() {
      throw new Error("simulated: usage ledger unreachable");
    },
  } as never;

  const result = await gatherLiveMarketIntelligence(throwingClient, {
    tenantId: "t1",
    businessName: "Acme",
    industry: "saas",
    location: "Bhilai, Chhattisgarh",
  });

  assert.equal(result.available, false, "a failure anywhere in the chain must produce an honest available:false, never throw");
  assert.equal(result.summary, null, "must never fabricate a summary when unavailable");
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.sources, []);
  assert.ok(result.reason && result.reason.length > 0, "must carry a real, non-empty reason");
  assert.ok(result.gatheredAt, "must still carry a real timestamp even on failure");
  console.log("market-intelligence.test.ts: an internal failure anywhere in the chain is converted to an honest available:false, never a thrown exception — PASS");
}

async function testEmptyTenantIdIsHandledSafely() {
  // createTenantAIRuntime throws synchronously on an empty tenantId
  // (tenant_required_for_billable_ai) -- must still be caught, not
  // propagate.
  const fakeClient = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }) }) } as never;
  const result = await gatherLiveMarketIntelligence(fakeClient, {
    tenantId: "",
    businessName: "Acme",
    industry: "saas",
    location: null,
  });
  assert.equal(result.available, false);
  console.log("market-intelligence.test.ts: an empty/invalid tenantId is handled safely, never thrown into the caller — PASS");
}

async function run() {
  await testAnyInternalFailureNeverThrowsAndIsHonest();
  await testEmptyTenantIdIsHandledSafely();
  console.log("market-intelligence.test.ts: ALL PASS");
  console.log("market-intelligence.test.ts: NOTE -- the real, successful, grounded-search happy path requires a live, billed network call and is deliberately not exercised in this automated suite, matching this codebase's own RESEARCH_ENGINE_V1.md pattern (RESEARCH_LIVE_SMOKE_TEST-gated, not run by default).");
}

run();
