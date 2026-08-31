// Regression for the real, live entitlement-resolution bug found and fixed
// in docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md (Update 15): the real
// StratXcel tenant's active `advanced_growth` subscription (₹18,498/mo,
// status "active") -- correctly shown as "Advanced Growth" by the header
// plan badge (lib/billing/customer-plan.ts, powered by the same canonical
// PLAN_DEFINITIONS this test also uses) -- was shown "Upgrade to unlock
// Google SEO workflows" at /app/search.
//
// Root cause: components/ui/EntitlementGate.tsx used to rank the
// subscription's plan_tier against a small, hand-maintained TIER_RANK map
// (`{ free: 0, starter: 1, growth: 2, business: 3, scale: 3 }`) that only
// knew about pre-v3-catalog legacy tier names. `TIER_RANK[tier] ?? 0`
// silently fell back to rank 0 -- the same as "free" -- for every single
// tier in the real, currently-sold commercial catalog (seo, social,
// seo_and_social, advanced_seo, advanced_social, advanced_growth,
// website_*), denying access to every real paying customer regardless of
// what they actually bought.
//
// Fixed by gating on PLAN_CAPABILITIES (the one real canonical catalog,
// already authoritative for plans.ts/entitlements.ts and the header badge)
// instead of a second, competing tier ranking. This test pins that fix at
// two levels: (1) the old broken mechanism cannot silently return, and (2)
// the exact real-catalog entitled/not-entitled matrix for Search Growth's
// "seo_execution" capability, across every current and legacy tier.
//
// Run with: node --experimental-strip-types components/ui/__tests__/entitlement-gate.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLAN_DEFINITIONS, isPlanTier, type PlanTier } from "../../../packages/payments-and-wallet/src/plans.ts";
import { hasCapability } from "../../../packages/payments-and-wallet/src/entitlements.ts";
import { isActivePaidSubscription } from "../../../lib/billing/plan-state.ts";

const source = fs.readFileSync(path.join(process.cwd(), "components", "ui", "EntitlementGate.tsx"), "utf8");
// Strip comments before checking for the old identifiers: this file's own
// doc comments legitimately name TIER_RANK/minTier/RequiredTier in prose to
// document the historical bug and fix (see docs/discovery/
// SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 15) -- a bare substring check
// against those mentions would be a false positive, the same class of
// self-defeating check already caught once this session in
// lib/rbac/__tests__/customer-app-stabilization.test.ts.
const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// --- The old, broken mechanism must not silently reappear -------------------
assert.doesNotMatch(codeOnly, /TIER_RANK/, "must never reintroduce a second, hand-maintained tier-rank map competing with PLAN_CAPABILITIES");
assert.doesNotMatch(codeOnly, /minTier/, "must never reintroduce the catalog-unaware minTier prop");
assert.doesNotMatch(codeOnly, /RequiredTier/, "must never reintroduce the legacy-only RequiredTier union");
assert.match(codeOnly, /requiredCapability/, "must gate on a named PLAN_CAPABILITIES flag");
assert.match(codeOnly, /hasCapability/, "must resolve entitlement through the canonical hasCapability() helper, not a local reimplementation");

// --- The real, reported bug: the real StratXcel tenant's exact plan --------
assert.equal(
  hasCapability("advanced_growth", "seo_execution"),
  true,
  "advanced_growth (the real StratXcel tenant's active plan) must unlock Search Growth / Google SEO workflows"
);

// --- Full real-catalog matrix: exactly which tiers unlock Search Growth ----
// One canonical source, no per-tier special-casing: this table is the
// PLAN_CAPABILITIES.seo_execution data restated as an explicit
// entitled/not-entitled expectation, so a future catalog edit that silently
// flips a tier is caught here rather than discovered live again.
const EXPECTED_SEO_EXECUTION: Record<PlanTier, boolean> = {
  free: false,
  seo: true,
  social: false,
  seo_and_social: true,
  advanced_seo: true,
  advanced_social: false,
  advanced_growth: true,
  website_landing_page: false,
  website_standard: false,
  website_custom: false,
  // Legacy DB tiers (historical rows only, fail closed for new checkout,
  // but existing subscribers on them must not lose access they're paying for).
  starter: true,
  growth: true,
  business: true,
  launch: true,
  custom_growth: true,
  scale: true,
};

for (const tier of Object.keys(PLAN_DEFINITIONS) as PlanTier[]) {
  assert.ok(tier in EXPECTED_SEO_EXECUTION, `${tier}: add an explicit entitled/not-entitled expectation to this test -- no tier may be silently unchecked`);
  assert.equal(
    hasCapability(tier, "seo_execution"),
    EXPECTED_SEO_EXECUTION[tier],
    `${tier}: seo_execution must be ${EXPECTED_SEO_EXECUTION[tier]} per the real commercial catalog`
  );
}

// --- Entitled / not entitled / expired / cancelled / renewed ---------------
// Mirrors EntitlementGate's own resolution exactly (subscription ->
// isActivePaidSubscription -> tier -> hasCapability) without rendering React,
// since this repo has no JSX-execution test capability (see
// components/search-growth/__tests__/no-fabrication.test.ts for the same
// constraint and pattern).
function resolveGateState(subscription: { status: string; plan_tier: string } | null, requiredCapability: "seo_execution") {
  const activePaid = isActivePaidSubscription(subscription);
  const tier = activePaid && isPlanTier(subscription!.plan_tier) ? subscription!.plan_tier : "free";
  return hasCapability(tier, requiredCapability) ? "unlocked" : "locked";
}

assert.equal(
  resolveGateState({ status: "active", plan_tier: "advanced_growth" }, "seo_execution"),
  "unlocked",
  "Entitled (active advanced_growth): must unlock"
);
assert.equal(
  resolveGateState({ status: "active", plan_tier: "social" }, "seo_execution"),
  "locked",
  "Not entitled (active social, no seo_execution): must stay locked, not fabricate access"
);
assert.equal(
  resolveGateState({ status: "expired", plan_tier: "advanced_growth" }, "seo_execution"),
  "locked",
  "Expired: an expired advanced_growth subscription must not unlock -- only 'active' counts as active-paid"
);
assert.equal(
  resolveGateState({ status: "cancelled", plan_tier: "advanced_growth" }, "seo_execution"),
  "locked",
  "Cancelled: a cancelled advanced_growth subscription must not unlock"
);
assert.equal(
  resolveGateState(null, "seo_execution"),
  "locked",
  "No subscription row at all: must stay locked, not throw or fabricate access"
);
assert.equal(
  resolveGateState({ status: "active", plan_tier: "free" }, "seo_execution"),
  "locked",
  "Free trial: must stay locked (isActivePaidSubscription already excludes plan_tier 'free')"
);
// Renewed: a subscription that lapsed and is now active again resolves
// identically to any other currently-active entitled subscription -- there
// is no separate "renewed" state to track, which is itself the correct,
// simple behavior (no stale "was once cancelled" flag suppressing access).
assert.equal(
  resolveGateState({ status: "active", plan_tier: "advanced_growth" }, "seo_execution"),
  "unlocked",
  "Renewed: a currently-active advanced_growth subscription must unlock, regardless of past lapses"
);

console.log("entitlement-gate.test.ts: ALL PASS");
