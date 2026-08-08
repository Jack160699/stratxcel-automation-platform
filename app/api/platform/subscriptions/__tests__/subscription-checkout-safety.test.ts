// Run with: node --experimental-strip-types app/api/platform/subscriptions/__tests__/subscription-checkout-safety.test.ts
//
// Static safety checks for subscription checkout/cancel/change-plan. Does not
// re-test reconcile_and_fulfill_razorpay_payment_v4, the webhook, or the
// Razorpay adapter — those are unmodified by this task and already covered
// elsewhere. This file only covers what this task actually changed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  const checkoutSource = readCode("app", "api", "platform", "subscriptions", "route.ts");

  // --- 1. Gated by PAYMENTS_SUBSCRIPTIONS_ENABLED, fails closed --------------
  assert.ok(/isPaymentFeatureEnabled\("PAYMENTS_SUBSCRIPTIONS_ENABLED"\)/.test(checkoutSource), "checkout must check PAYMENTS_SUBSCRIPTIONS_ENABLED");
  assert.ok(/if \(!isPaymentFeatureEnabled\("PAYMENTS_SUBSCRIPTIONS_ENABLED"\)\)/.test(checkoutSource), "flag check must gate before anything else runs");

  // --- 2. Custom Growth is never self-service-checked-out ---------------------
  assert.ok(/getSelfServicePlan\(planTier\)/.test(checkoutSource), "price/availability must be resolved via the canonical plan module, not inline");
  assert.ok(/if \(!plan\)/.test(checkoutSource), "an unavailable (non-self-service) plan must be rejected before any subscription row is created");
  assert.equal(/2399900|23999/.test(checkoutSource), false, "no hardcoded Custom Growth price may exist in the checkout route — it is quote-led");

  // --- 3. Price and purpose are always server-resolved, never client input ---
  assert.equal(/amountCents\s*:\s*body\./.test(checkoutSource), false, "no amount field may ever be read from the request body");
  assert.equal(/priceCents\s*:\s*body\./.test(checkoutSource), false, "no price field may ever be read from the request body");
  assert.ok(/paymentPurpose:\s*"subscription_payment"/.test(checkoutSource), "purpose must be hardcoded to subscription_payment");
  assert.equal(/wallet_topup|audit_fee|domain_purchase|domain_renewal|continuation_pack/.test(checkoutSource), false, "checkout route must not touch any other payment purpose");

  // --- 4. Tenant ownership is always re-derived server-side -------------------
  assert.ok(/requireTenantContext\(tenantId\)/.test(checkoutSource), "every handler must re-derive tenant membership from the session, not trust the body alone");

  // --- 5. Cancel / change-plan routes re-validate tenant ownership in the RPC call itself
  const cancelSource = readCode("app", "api", "platform", "subscriptions", "[id]", "cancel", "route.ts");
  assert.ok(/set_subscription_cancellation/.test(cancelSource), "cancellation must go through the dedicated RPC, not a raw update");
  assert.ok(/p_tenant_id:\s*tenantId/.test(cancelSource), "cancellation RPC call must pass tenantId for server-side re-validation");

  const changePlanSource = readCode("app", "api", "platform", "subscriptions", "[id]", "change-plan", "route.ts");
  assert.ok(/schedule_subscription_plan_change/.test(changePlanSource), "plan changes must go through the dedicated RPC, not a raw update");
  assert.ok(/isPlanTier\(targetPlanTier\)/.test(changePlanSource), "target plan tier must be validated against the canonical plan set before it ever reaches the RPC");

  // --- 6. The migration's plan-change RPC itself refuses Custom Growth as a target
  const migrationSource = read("supabase", "migrations", "20260807223455_subscriptions_lifecycle_billing_gst.sql");
  assert.ok(
    /p_target_plan_tier not in \('launch', 'growth'\)/.test(migrationSource),
    "schedule_subscription_plan_change must reject any target outside launch/growth server-side"
  );

  // --- 7. Additive only: the migration never touches the live payment orchestrator
  // (a comment explaining that it's untouched is fine; redefining it is not)
  assert.equal(
    /create (or replace )?function public\.reconcile_and_fulfill_razorpay_payment_v4/.test(migrationSource),
    false,
    "must not modify the live payment-fulfilment orchestrator"
  );
  assert.equal(/drop\s+table/i.test(migrationSource), false, "migration must not drop any table");
  assert.equal(/drop\s+column/i.test(migrationSource), false, "migration must not drop any column");

  // --- 8. New tables carry RLS + a tenant-scoped read policy -------------------
  for (const table of ["billing_profiles", "invoices", "credit_notes"]) {
    assert.ok(new RegExp(`alter table ${table} enable row level security;`).test(migrationSource), `${table}: RLS must be enabled`);
    assert.ok(
      new RegExp(`create policy \\w+ on ${table} for select[\\s\\S]{0,300}tenant_members`).test(migrationSource),
      `${table}: must have a tenant-scoped select policy`
    );
  }

  console.log("subscription-checkout-safety.test.ts: ALL PASS");
}

run();
