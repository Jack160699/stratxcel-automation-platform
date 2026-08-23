// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// GET /api/platform/subscriptions 500'd for any tenant with an active
// go_free_trial subscription.
//
// Root cause: splitGstInclusive() deliberately throws on 0
// ("zero is not a valid charge" -- see audit-payment-safety.test.ts, which
// this test does not weaken). The route unconditionally called
// splitGstInclusive(subscription.price_cents) whenever a subscription
// existed, but a genuine GoFree trial subscription has price_cents = 0 by
// design (redeem_subscription_go_free_code_v1 inserts price_cents: 0).
// Confirmed live via runtime logs: "Error: totalCents must be a positive
// integer" on the exact request right after a real GoFree redemption.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/api/platform/subscriptions/__tests__/gofree-billing-get-safety.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routeSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "route.ts"),
  "utf8"
);

function run() {
  const getFn = routeSource.split("export async function GET(request: Request) {")[1] ?? "";
  assert.ok(getFn.length > 0, "could not locate GET handler in app/api/platform/subscriptions/route.ts");

  assert.doesNotMatch(
    getFn,
    /priceBreakdown:\s*subscription\s*\?\s*splitGstInclusive\(subscription\.price_cents\)\s*:\s*null/,
    "GET must not unconditionally call splitGstInclusive on subscription.price_cents -- it throws on 0, " +
      "which a real go_free_trial subscription legitimately has"
  );
  assert.match(
    getFn,
    /priceBreakdown:\s*subscription\s*&&\s*subscription\.price_cents\s*>\s*0\s*\?\s*splitGstInclusive\(subscription\.price_cents\)\s*:\s*null/,
    "GET must guard splitGstInclusive with a price_cents > 0 check so a ₹0 GoFree trial subscription never reaches it"
  );

  console.log("PASS: GET /api/platform/subscriptions never calls splitGstInclusive on a ₹0 (GoFree trial) subscription");
}

run();
