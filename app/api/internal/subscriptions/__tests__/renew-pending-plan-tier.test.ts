// Regression for the real defect found and fixed alongside the
// EntitlementGate bug (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
// Update 15): app/api/internal/subscriptions/renew/route.ts used to only
// apply a scheduled pending_plan_tier change at renewal if it was exactly
// "starter", "growth", or "business" -- the same legacy-only-tier pattern
// as the EntitlementGate bug. A real in-app "Change plan" action
// (app/app/billing/page.tsx -> /api/platform/subscriptions/[id]/change-plan)
// can set pending_plan_tier to any current v3 catalog tier (seo, social,
// seo_and_social, advanced_seo, advanced_social, advanced_growth,
// website_*), which the old check would silently never apply -- the
// subscription would keep renewing at the old tier/price forever.
//
// Confirmed live before fixing: zero subscriptions currently have a
// pending_plan_tier set (SELECT * FROM subscriptions WHERE
// pending_plan_tier IS NOT NULL -> 0 rows), so this was a latent defect,
// not an active incident -- no real tenant's billing was ever touched
// investigating or fixing this.
//
// Run with: node --experimental-strip-types app/api/internal/subscriptions/__tests__/renew-pending-plan-tier.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isPlanTier, type PlanTier } from "../../../../../packages/payments-and-wallet/src/plans.ts";

const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "internal", "subscriptions", "renew", "route.ts"), "utf8");
const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// --- The old, catalog-unaware check must not silently reappear -------------
assert.doesNotMatch(
  codeOnly,
  /pending_plan_tier\s*===\s*"starter"\s*\|\|\s*sub\.pending_plan_tier\s*===\s*"growth"\s*\|\|\s*sub\.pending_plan_tier\s*===\s*"business"/,
  "must never reintroduce the hardcoded starter/growth/business-only check"
);
assert.match(codeOnly, /isPlanTier\(sub\.pending_plan_tier\)/, "must resolve a pending plan-tier change through the canonical isPlanTier() guard");

// --- Mirrors the route's exact decision branch: `if (sub.pending_plan_tier
// && isPlanTier(sub.pending_plan_tier)) planTier = sub.pending_plan_tier;`
// -- without needing to mock Supabase/Razorpay I/O for the rest of the
// handler, the same proportionate approach as
// components/ui/__tests__/entitlement-gate.test.ts.
function resolveRenewalPlanTier(currentTier: PlanTier, pendingPlanTier: string | null): PlanTier {
  if (pendingPlanTier && isPlanTier(pendingPlanTier)) return pendingPlanTier;
  return currentTier;
}

// A real, current v3-catalog downgrade must actually apply.
assert.equal(
  resolveRenewalPlanTier("advanced_growth", "seo"),
  "seo",
  "a real customer downgrading advanced_growth -> seo must actually renew at the new tier, not silently keep the old one"
);
assert.equal(
  resolveRenewalPlanTier("free", "advanced_growth"),
  "advanced_growth",
  "a real customer upgrading free -> advanced_growth must actually renew at the new tier"
);
for (const tier of ["seo", "social", "seo_and_social", "advanced_seo", "advanced_social", "advanced_growth", "website_landing_page", "website_standard", "website_custom"] as const) {
  assert.equal(resolveRenewalPlanTier("free", tier), tier, `pending change to current v3 tier "${tier}" must apply at renewal`);
}
// Legacy tiers (pre-existing pending rows, if any ever existed) still apply.
for (const tier of ["starter", "growth", "business"] as const) {
  assert.equal(resolveRenewalPlanTier("free", tier), tier, `pending change to legacy tier "${tier}" must still apply (no regression from the old behavior)`);
}
// No pending change: stays on the current tier.
assert.equal(resolveRenewalPlanTier("advanced_growth", null), "advanced_growth", "no pending_plan_tier: must keep renewing at the current tier");
// Garbage/invalid value: fails closed to the current tier, never crashes or silently switches to an unknown tier.
assert.equal(resolveRenewalPlanTier("advanced_growth", "not_a_real_tier"), "advanced_growth", "an invalid pending_plan_tier must fail closed to the current tier, not apply garbage");

console.log("renew-pending-plan-tier.test.ts: ALL PASS");
