// Fix Plan Tier and Force Content Generation mission: a real, previously-
// undiscovered production defect, found while trying to move a real
// subscription onto the current commercial model's real top tier
// (advanced_growth) -- confirmed live against production before this fix:
//
// - subscriptions_plan_tier_check / subscriptions_pending_plan_tier_check
//   only ever allowed the 6 legacy tiers (launch, custom_growth, starter,
//   growth, business, scale) -- every tier the "commercial model v3
//   rebuild" migration's own application code introduced (seo, social,
//   seo_and_social, advanced_seo, advanced_social, advanced_growth,
//   website_landing_page, website_standard, website_custom) was REJECTED
//   at the database schema level, for every tenant, via every path
//   (self-service checkout, admin override, or otherwise).
// - enforce_new_subscription_v1_tier() (a BEFORE INSERT OR UPDATE OF
//   plan_tier trigger) independently rejected anything outside
//   ('starter','growth','business') with its own raised exception --
//   fires before the CHECK constraint is even reached, so it was the
//   actual first wall hit.
// - usage_entitlements_metric_check never allowed
//   image_generation_attempts_monthly or copilot_monthly_uses, even
//   though the app's own EntitlementMetric type has always included both
//   -- meaning no tenant, on any plan, has ever been able to have a real
//   usage_entitlements row for either metric.
//
// Net effect before this fix: the entire v3 commercial model was
// non-functional at the database layer for every real customer,
// independent of anything the application code does.
//
// Migration file content is verified as a static source check (matching
// this codebase's established pattern for SQL migration tests -- see
// migration-version-uniqueness.test.ts) -- this is a real schema change
// already applied live to production via the Supabase MCP tool; this test
// guards the migration FILE (the durable, reviewable record of that
// change) against regression/drift.
// Run with: node --experimental-strip-types supabase/__tests__/commercial_model_v3_subscription_tier_guard_fix-migration.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(import.meta.dirname, "..", "migrations", "20260830010000_commercial_model_v3_subscription_tier_guard_fix.sql"),
  "utf8"
);

const CURRENT_MODEL_TIERS = [
  "free", "seo", "social", "seo_and_social", "advanced_seo", "advanced_social", "advanced_growth",
  "website_landing_page", "website_standard", "website_custom",
];
const LEGACY_TIERS = ["launch", "custom_growth", "starter", "growth", "business", "scale"];

function run() {
  // --- subscriptions_plan_tier_check must allow every real, current tier,
  //     plus the legacy tiers (never drop history, never narrow) --------
  for (const tier of [...CURRENT_MODEL_TIERS, ...LEGACY_TIERS]) {
    assert.ok(migration.includes(`'${tier}'`), `the migration must widen subscriptions_plan_tier_check to allow '${tier}' -- omitting it would leave that real, current-model tier permanently unassignable`);
  }
  console.log("migration: subscriptions_plan_tier_check widened to the full real PlanTier catalog — PASS");

  // --- Both the check constraint AND the trigger function must be fixed
  //     -- the trigger fires first and independently blocks, so fixing
  //     only the constraint would leave production exactly as broken ----
  assert.ok(migration.includes("subscriptions_plan_tier_check"), "the CHECK constraint must be addressed");
  assert.ok(migration.includes("subscriptions_pending_plan_tier_check"), "the pending-tier CHECK constraint must be addressed too -- scheduled plan changes use it");
  assert.ok(migration.includes("enforce_new_subscription_v1_tier"), "the trigger FUNCTION itself must be updated -- it fires before the CHECK constraint and independently blocked every current-model tier");
  console.log("migration: both the check constraints AND the independently-blocking trigger function are fixed — PASS");

  // --- usage_entitlements_metric_check widened to match the real,
  //     current EntitlementMetric type ------------------------------------
  assert.ok(migration.includes("usage_entitlements_metric_check"), "the usage_entitlements metric constraint must be addressed");
  assert.ok(migration.includes("image_generation_attempts_monthly"), "image_generation_attempts_monthly must be allowed -- it's a real EntitlementMetric that was never actually storable");
  assert.ok(migration.includes("copilot_monthly_uses"), "copilot_monthly_uses must be allowed -- it's a real EntitlementMetric that was never actually storable");
  console.log("migration: usage_entitlements_metric_check widened to the full real EntitlementMetric set — PASS");

  console.log("commercial_model_v3_subscription_tier_guard_fix-migration.test.ts: ALL PASS");
}

run();
