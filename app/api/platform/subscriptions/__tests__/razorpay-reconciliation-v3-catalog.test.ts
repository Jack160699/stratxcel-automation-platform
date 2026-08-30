// Run with: node --experimental-strip-types app/api/platform/subscriptions/__tests__/razorpay-reconciliation-v3-catalog.test.ts
//
// SEVERE real defect found live (Hermes platform-restructure mission): the
// real checkout route (POST /api/platform/subscriptions) already uses
// getSelfServicePlan(planTier) and creates a real Razorpay payment link /
// AutoPay subscription for any of the 5 current recurring self-service
// tiers (seo, social, advanced_seo, advanced_social, advanced_growth). But
// reconcile_and_fulfill_razorpay_payment_v4 and
// reconcile_and_fulfill_razorpay_subscription_charge -- the real, live
// webhook-triggered RPCs that actually activate a subscription and grant
// entitlements once Razorpay captures the payment -- only ever recognized
// plan_tier IN ('starter','growth','business'), the legacy v2 catalog. A
// real customer paying for a real current plan would have their money
// captured by Razorpay but never receive an active subscription or any
// entitlements. Confirmed live via direct query before fixing: zero real
// (non-GoFree) subscriptions existed yet on any v3 tier, so this had not
// yet harmed a real customer -- caught before the first one, not after.
//
// This file proves the fix migration (20260830090000) adds all 5 tiers to
// BOTH RPCs with prices/limits that exactly match the real TS source of
// truth, and that every legacy branch is still present (additive, not a
// replacement).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_DEFINITIONS, getSelfServicePlan } from "../../../../../packages/payments-and-wallet/src/plans.ts";
import { PLAN_LIMITS } from "../../../../../packages/payments-and-wallet/src/entitlements.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

const V3_RECURRING_TIERS: Array<"seo" | "social" | "advanced_seo" | "advanced_social" | "advanced_growth"> = [
  "seo",
  "social",
  "advanced_seo",
  "advanced_social",
  "advanced_growth",
];

// This RPC's own real v_metrics order (8 elements) -- distinct from the
// GoFree migration's 6-element subset. Must match both live functions.
const RPC_METRIC_ORDER: Array<keyof (typeof PLAN_LIMITS)["free"]> = [
  "social_posts",
  "meta_ad_campaigns",
  "whatsapp_contacts",
  "website_maintenance",
  "content_generation_monthly",
  "automated_content_monthly",
  "social_autopilot_automated_monthly",
  "social_autopilot_manual_monthly",
];

function run() {
  const migration = read("supabase", "migrations", "20260830090000_razorpay_reconciliation_v3_catalog_support.sql");

  // Both real RPC signatures must be redefined by this migration.
  assert.match(migration, /create or replace function public\.reconcile_and_fulfill_razorpay_payment_v4/);
  assert.match(migration, /create or replace function public\.reconcile_and_fulfill_razorpay_subscription_charge/);

  for (const tier of V3_RECURRING_TIERS) {
    assert.ok(getSelfServicePlan(tier), `${tier} must actually be a real, current self-service plan (sanity check on the test itself)`);

    const expectedPrice = PLAN_DEFINITIONS[tier].priceCents;
    assert.ok(Number.isFinite(expectedPrice), `${tier} must have a real, non-null price`);

    const expectedLimits = RPC_METRIC_ORDER.map((metric) => PLAN_LIMITS[tier][metric]);
    const expectedLimitsLiteral = `array[${expectedLimits.join(", ")}]`;
    const expectedLimitsLiteralNoSpace = `array[${expectedLimits.join(",")}]`;

    // v4 (payment_link.paid path)
    assert.match(migration, new RegExp(`v_plan_tier = '${tier}' then`), `payment_v4 must handle the real current plan_tier=${tier}`);
    assert.ok(
      migration.includes(`v_base_price := ${expectedPrice};`),
      `payment_v4: expected v_base_price := ${expectedPrice} for ${tier} — must match PLAN_DEFINITIONS.${tier}.priceCents exactly`
    );
    assert.ok(
      migration.includes(`v_limits_${tier} int[] := ${expectedLimitsLiteral};`) || migration.includes(`v_limits_${tier} int[] := ${expectedLimitsLiteralNoSpace};`),
      `payment_v4: expected v_limits_${tier} to equal entitlements.ts PLAN_LIMITS.${tier} in the real 8-metric RPC order`
    );

    // subscription_charge (AutoPay path)
    assert.match(migration, new RegExp(`v_effective_plan = '${tier}' then`), `subscription_charge must handle the real current plan_tier=${tier}`);
    assert.ok(
      migration.includes(`v_catalog_cents := ${expectedPrice}; v_limits := v_limits_${tier};`),
      `subscription_charge: expected v_catalog_cents := ${expectedPrice} for ${tier}`
    );
  }

  // Legacy branches must still be present, byte-for-byte reachable — additive,
  // never a replacement of the original real coverage.
  for (const tier of ["starter", "growth", "business"] as const) {
    assert.match(migration, new RegExp(`v_plan_tier = '${tier}' then`), `payment_v4: legacy plan_tier=${tier} must still be handled`);
    assert.match(migration, new RegExp(`v_effective_plan = '${tier}' then`), `subscription_charge: legacy plan_tier=${tier} must still be handled`);
  }
  assert.match(migration, /'legacy_plan_not_payable'/);
  assert.match(migration, /'plan_not_self_checkout'/);
  assert.match(migration, /'unknown_plan_tier'/);

  // The two one-time website plans must NOT be routed through this
  // recurring-subscription RPC (documented reason: 30-day period grant
  // doesn't match a one-time purchase; neither has a live checkout button
  // today either).
  assert.doesNotMatch(migration, /v_plan_tier = 'website_landing_page'/);
  assert.doesNotMatch(migration, /v_plan_tier = 'website_standard'/);
  assert.doesNotMatch(migration, /v_effective_plan = 'website_landing_page'/);
  assert.doesNotMatch(migration, /v_effective_plan = 'website_standard'/);

  console.log("razorpay-reconciliation-v3-catalog.test.ts: both real RPCs match the real TS plan/entitlement source for every v3 tier — PASS");
  console.log("razorpay-reconciliation-v3-catalog.test.ts: ALL PASS");
}

run();
