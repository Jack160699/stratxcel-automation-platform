import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

console.log("Running StratXcel usage_entitlements_metric_check Widening Migration Test...\n");

// Regression for a P0 finding from live E2E testing on 2026-08-23:
// 20260822120000_v2_commercial_model_realignment.sql patched the REAL
// Razorpay payment reconciliation RPCs (reconcile_and_fulfill_razorpay_
// payment_v4, reconcile_and_fulfill_razorpay_subscription_charge) to grant
// two new entitlement metrics -- content_generation_monthly and
// automated_content_monthly -- but never widened
// usage_entitlements_metric_check to allow them. Confirmed live via
// pg_get_constraintdef on the production table: the constraint only allowed
// the original four metrics. Effect: every attempt to insert either new
// metric 500'd with "violates check constraint usage_entitlements_metric_check"
// -- discovered testing GoFree subscription redemption
// (redeem_subscription_go_free_code_v1 uses the identical six-metric array),
// but because the real payment RPCs above use the exact same array, any
// PAYING customer activating Starter/Growth/Business via Razorpay would hit
// the same failure after their payment succeeded.
const widening = readFileSync(
  new URL("../migrations/20260823140000_widen_usage_entitlements_metric_check.sql", import.meta.url),
  "utf8",
);

const ALL_SIX_METRICS = [
  "social_posts",
  "meta_ad_campaigns",
  "whatsapp_contacts",
  "website_maintenance",
  "content_generation_monthly",
  "automated_content_monthly",
];

for (const metric of ALL_SIX_METRICS) {
  assert.ok(widening.includes(`'${metric}'`), `widening migration must allow metric '${metric}'`);
}

// Every migration/RPC that inserts into usage_entitlements with the six-metric
// array must only ever use metrics from this same allowed set -- catches the
// exact class of drift that caused this bug (a v_metrics array widened in one
// place without widening the table constraint that has to accept it).
const sourceFiles = [
  "../migrations/20260822120000_v2_commercial_model_realignment.sql",
  "../migrations/20260823130000_go_free_subscription_activation.sql",
];
const metricArrayPattern = /v_metrics(?:_starter|_growth|_business)?\s+text\[\]\s*(?::=)?\s*array\[([^\]]+)\]/g;

for (const file of sourceFiles) {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  let match: RegExpExecArray | null;
  let foundArray = false;
  while ((match = metricArrayPattern.exec(src)) !== null) {
    foundArray = true;
    const literals = [...match[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    for (const metric of literals) {
      assert.ok(
        ALL_SIX_METRICS.includes(metric),
        `${file} references metric '${metric}' via a v_metrics array, which is not in usage_entitlements_metric_check's allowed set`
      );
    }
  }
  assert.ok(foundArray, `expected to find at least one v_metrics array literal in ${file}`);
}

console.log("PASS: usage_entitlements_metric_check allows all six v2-model metrics, and every v_metrics array stays within that set\n");
