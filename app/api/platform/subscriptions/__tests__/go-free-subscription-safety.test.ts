// Run with: node --experimental-strip-types app/api/platform/subscriptions/__tests__/go-free-subscription-safety.test.ts
//
// Static + pure-function safety checks for GoFree — the internal test/trial
// 100% discount activation of a self-service subscription plan (Starter /
// Growth / Business). No live Supabase project is reachable from this
// environment, so this mirrors the existing go-free-promo-safety.test.ts /
// dual-role-promo-redeem.test.ts / subscription-checkout-safety.test.ts
// pattern: exercise the real pure-TS helpers directly, and statically verify
// the route/migration source for the invariants a live DB run cannot yet
// confirm here. Does not re-test redeem_audit_go_free_code_v1,
// reconcile_and_fulfill_razorpay_payment_v4, or reconcile_and_fulfill_
// razorpay_subscription_charge — all untouched by this feature.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBSCRIPTION_GO_FREE_PRODUCT_SCOPE,
  SUBSCRIPTION_GO_FREE_PAYMENT_PURPOSE,
  generateSubscriptionGoFreeCode,
  hashPromoCode,
  normalizePromoCode,
  isCustomPromoCodeFormat,
  publicPromoMessage,
} from "../../../../../lib/promo/go-free.ts";
import { PLAN_LIMITS } from "../../../../../packages/payments-and-wallet/src/entitlements.ts";
import { PLAN_DEFINITIONS, getSelfServicePlan } from "../../../../../packages/payments-and-wallet/src/plans.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  // ===========================================================================
  // 1. Pure helpers
  // ===========================================================================
  assert.equal(SUBSCRIPTION_GO_FREE_PRODUCT_SCOPE, "subscription_payment");
  assert.equal(SUBSCRIPTION_GO_FREE_PAYMENT_PURPOSE, "subscription_payment");
  assert.equal(normalizePromoCode(" gofree "), "GOFREE");
  assert.ok(isCustomPromoCodeFormat("GOFREE"), "GOFREE must be a valid custom code format");
  assert.equal(hashPromoCode("GOFREE"), hashPromoCode(normalizePromoCode(" gofree ")));
  const generated = generateSubscriptionGoFreeCode();
  assert.match(generated, /^SUB-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(publicPromoMessage("plan_not_self_checkout"), "This plan isn't available for GoFree activation.");
  assert.equal(publicPromoMessage("tenant_already_has_subscription"), "This workspace already has an active plan.");
  assert.equal(publicPromoMessage("wrong_product"), "This code isn't available for this product.");
  assert.equal(publicPromoMessage("max_uses"), "This code has already been used.");
  assert.equal(publicPromoMessage("nope"), "This code is invalid.");

  // ===========================================================================
  // 2. Migration invariants — plan tier coverage, pricing, non-revenue
  //    classification, atomicity/idempotency, revoke/grant discipline
  // ===========================================================================
  const migration = read("supabase", "migrations", "20260823130000_go_free_subscription_activation.sql");

  assert.match(migration, /create or replace function public\.redeem_subscription_go_free_code_v1/);
  assert.match(migration, /create or replace function public\.validate_subscription_go_free_code_v1/);
  assert.match(migration, /Does NOT modify reconcile_and_fulfill_razorpay_payment_v4/);
  assert.match(migration, /Does NOT modify[\s\S]*redeem_audit_go_free_code_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.reconcile_and_fulfill_razorpay_payment_v4/);
  assert.doesNotMatch(migration, /create or replace function public\.reconcile_and_fulfill_razorpay_subscription_charge/);
  assert.doesNotMatch(migration, /create or replace function public\.redeem_audit_go_free_code_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.validate_audit_go_free_code_v1/);

  // Exact locked v2 commercial model prices, independently hardcoded server-side
  // (never trusts a caller-supplied price beyond a cross-check).
  assert.match(migration, /v_price_cents := 299900/);
  assert.match(migration, /v_price_cents := 799900/);
  assert.match(migration, /v_price_cents := 1599900/);
  assert.match(migration, /p_price_cents is distinct from v_price_cents/, "a mismatched caller-supplied price must be rejected");

  // Every plan tier must resolve to *some* entitlement grant — the RPC must not
  // silently admit a plan tier it has no limits for.
  for (const tier of ["starter", "growth", "business"] as const) {
    assert.match(migration, new RegExp(`p_plan_tier = '${tier}' then`), `RPC must handle plan_tier=${tier}`);
  }
  assert.match(migration, /plan_not_self_checkout/, "unknown/non-self-service plan tiers must fail closed");

  // The six hardcoded entitlement-limit arrays must be byte-for-byte identical
  // to the real TS source of truth (packages/payments-and-wallet/src/entitlements.ts)
  // — SQL cannot import TS, so this is the only thing that can catch drift.
  const toArray = (l: (typeof PLAN_LIMITS)["starter"]) => [
    l.social_posts,
    l.meta_ad_campaigns,
    l.whatsapp_contacts,
    l.website_maintenance,
    l.content_generation_monthly,
    l.automated_content_monthly,
  ];
  for (const tier of ["starter", "growth", "business"] as const) {
    const expected = `array[${toArray(PLAN_LIMITS[tier]).join(', ')}]`;
    assert.ok(
      migration.includes(expected),
      `expected migration to contain v_limits := ${expected} for ${tier} — found drift vs entitlements.ts PLAN_LIMITS.${tier}`
    );
  }
  // And the prices must match PLAN_DEFINITIONS too.
  assert.equal(PLAN_DEFINITIONS.starter.priceCents, 299900);
  assert.equal(PLAN_DEFINITIONS.growth.priceCents, 799900);
  assert.equal(PLAN_DEFINITIONS.business.priceCents, 1599900);

  // Never real revenue: distinct billing_provider value, status stays 'active'
  // (so every existing capability/entitlement check keeps working), amount
  // paid is always 0.
  assert.match(migration, /billing_provider in \('razorpay_payment_link', 'razorpay_subscription', 'go_free_trial'\)/);
  assert.match(migration, /'active',[\s\S]{0,80}v_period_start, v_period_end, 0,[\s\S]{0,80}'go_free_trial_activated', 'go_free_trial'/);
  assert.match(migration, /v_price_cents, v_price_cents, 0,/, "promo_redemptions insert must set amount_due_cents literal 0");
  assert.match(migration, /current_period_end := now\(\) \+ interval '30 days'|v_period_end timestamptz := now\(\) \+ interval '30 days'/);

  // promo_redemptions: exactly one of audit_order_id / subscription_id, both
  // partial-unique (one redemption per target, exactly-once).
  assert.match(migration, /promo_redemptions_exactly_one_target/);
  assert.match(migration, /promo_redemptions_subscription_unique_idx/);
  assert.match(migration, /promo_redemptions_audit_order_unique_idx/);

  // Idempotency: replay by idempotency_key must return the same result, never
  // create a second subscription.
  assert.match(migration, /where idempotency_key = p_idempotency_key/);
  assert.match(migration, /already_redeemed., true/);

  // Abuse control: a tenant already carrying an active/pending/past_due
  // subscription (real or trial) cannot double-activate.
  assert.match(migration, /tenant_already_has_subscription/);
  assert.match(migration, /status in \('active', 'pending_payment', 'past_due'\)/);

  // Per-code / per-customer / expiry / active / allowed-email checks present
  // (mirrors redeem_audit_go_free_code_v1's hardening).
  for (const guard of ["max_redemptions", "max_redemptions_per_customer", "expires_at", "is_active", "allowed_email"]) {
    assert.ok(migration.includes(guard), `expected redeem RPC to check ${guard}`);
  }

  // service_role-only execute grants — never public/anon/authenticated.
  assert.match(migration, /revoke execute on function public\.redeem_subscription_go_free_code_v1[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.redeem_subscription_go_free_code_v1[\s\S]*to service_role/);
  assert.match(migration, /revoke execute on function public\.validate_subscription_go_free_code_v1[\s\S]*from public, anon, authenticated/);

  console.log("go-free-subscription-safety.test.ts: migration invariants PASS");

  // ===========================================================================
  // 3. Redeem/validate route source — server authority, no Razorpay, no client
  //    price/discount trust, authenticated tenant context (not guest)
  // ===========================================================================
  const redeem = readCode("app", "api", "platform", "subscriptions", "go-free", "redeem", "route.ts");
  const validate = readCode("app", "api", "platform", "subscriptions", "go-free", "validate", "route.ts");

  for (const routeSrc of [redeem, validate]) {
    assert.doesNotMatch(routeSrc, /createPaymentLink/);
    assert.doesNotMatch(routeSrc, /createRazorpaySubscription/);
    assert.doesNotMatch(routeSrc, /razorpay/i);
    assert.doesNotMatch(routeSrc, /amountDueCents\s*[:=]\s*body\./, "amount due must never be read from client input");
    assert.doesNotMatch(routeSrc, /discountCents\s*[:=]\s*body\./, "discount must never be read from client input");
    assert.doesNotMatch(routeSrc, /priceCents\s*[:=]\s*body\./, "price must never be read from client input");
    assert.match(routeSrc, /getSelfServicePlan\(planTier\)/, "plan/price must be resolved via the canonical plan module");
    assert.match(routeSrc, /isPaymentFeatureEnabled\("PAYMENTS_SUBSCRIPTIONS_ENABLED"\)/);
    assert.match(routeSrc, /requireTenantContext\(tenantId\)/, "must use the real, membership-verified tenant context — never a guest path");
    assert.match(routeSrc, /enforcePromoRateLimit/);
  }

  // Redeem specifically: real RPC call, real idempotency key, staff blocked.
  assert.match(redeem, /redeem_subscription_go_free_code_v1/);
  assert.match(redeem, /p_idempotency_key/);
  assert.match(redeem, /resolveCanonicalIdentity\(\s*\{\s*routeSurface:\s*"app"\s*\}\s*\)/);
  assert.match(redeem, /if\s*\(\s*identity\.state\s*===\s*"INTERNAL_STAFF"\s*\|\|\s*identity\.state\s*===\s*"STAFF_VIEWING_CLIENT"\s*\)/);
  assert.match(redeem, /status:\s*403/);
  assert.match(validate, /validate_subscription_go_free_code_v1/);
  assert.match(validate, /amountDueCents:\s*0/);

  console.log("go-free-subscription-safety.test.ts: route source invariants PASS");

  // ===========================================================================
  // 4. Renewal cron — a GoFree trial must never trigger a real Razorpay
  //    payment link when its period ends, and the skip must come BEFORE the
  //    payment-link creation, not after.
  // ===========================================================================
  const renew = readCode("app", "api", "internal", "subscriptions", "renew", "route.ts");
  assert.match(renew, /billing_provider === "go_free_trial"/);
  const goFreeSkipIdx = renew.indexOf('billing_provider === "go_free_trial"');
  const createLinkIdx = renew.indexOf("await createPaymentLink(serviceDb");
  assert.ok(goFreeSkipIdx !== -1 && createLinkIdx !== -1, "expected both the go_free_trial skip and the createPaymentLink call to exist");
  assert.ok(goFreeSkipIdx < createLinkIdx, "the go_free_trial skip must be checked BEFORE createPaymentLink runs in the renewal loop");

  console.log("go-free-subscription-safety.test.ts: renewal cron safety PASS");

  // ===========================================================================
  // 5. Admin promo-code surface — GoFree code creation stays platform-staff-
  //    only, product scope is explicit and validated, existing role
  //    restriction (no audit_reviewer/finance_reviewer) is preserved.
  // ===========================================================================
  const adminList = readCode("app", "api", "platform", "admin", "promo-codes", "route.ts");
  assert.match(adminList, /requirePlatformStaff/);
  assert.match(adminList, /platform_owner/);
  assert.match(adminList, /platform_admin/);
  assert.doesNotMatch(adminList, /audit_reviewer/);
  assert.doesNotMatch(adminList, /finance_reviewer/);
  assert.match(adminList, /productScope/);
  assert.match(adminList, /audit_fee.*subscription_payment|subscription_payment.*audit_fee/s);

  console.log("go-free-subscription-safety.test.ts: admin surface invariants PASS");

  // ===========================================================================
  // 6. Revenue dashboard — GoFree redemptions must never contribute to
  //    grossInr/successfulPayments; the finance route must show them as a
  //    distinct, explicitly-labeled complimentary line.
  // ===========================================================================
  const finance = readCode("app", "api", "platform", "admin", "finance", "route.ts");
  assert.match(finance, /GoFree Test\/Trial Subscriptions/);
  assert.match(finance, /isComplimentary:\s*true/);
  assert.doesNotMatch(finance, /subscriptions["']\)/, "finance route must not query the subscriptions table directly for revenue — payment_links/promo_redemptions remain the only revenue sources");

  const revenueTruth = readCode("lib", "finance", "revenue-truth.ts");
  assert.match(revenueTruth, /amountDue === 0 && discount > 0/, "any ₹0-due redemption (audit or subscription) must be excluded from grossInr regardless of product");

  console.log("go-free-subscription-safety.test.ts: revenue exclusion PASS");

  // ===========================================================================
  // 7. Billing UI — minimum surface, no redesign, no client-trusted discount
  // ===========================================================================
  const billingPage = readCode("app", "app", "billing", "page.tsx");
  assert.match(billingPage, /\/api\/platform\/subscriptions\/go-free\/redeem/);
  assert.match(billingPage, /go_free_trial/);
  assert.doesNotMatch(billingPage, /amountDueCents:\s*0/, "the client must never assert its own ₹0 due amount — only the server response after redemption may say so");

  console.log("go-free-subscription-safety.test.ts: billing UI invariants PASS");

  // ===========================================================================
  // 8. v3 catalog support — real live bug found during the Hermes mission's
  //    real end-to-end test: the original migration only ever recognized the
  //    legacy v2 tiers (starter/growth/business, now selfServiceCheckout:
  //    false), so GoFree subscription redemption could not activate ANY plan
  //    a real customer can actually buy today. Verifies the follow-up
  //    migration adds the 5 real RECURRING self-service tiers with prices/
  //    limits that exactly match PLAN_DEFINITIONS/PLAN_LIMITS, and that the
  //    billing page no longer hardcodes the dead legacy tier set.
  // ===========================================================================
  const v3Migration = read("supabase", "migrations", "20260830080000_go_free_subscription_v3_catalog_support.sql");
  const v3EligibleTiers: Array<{ tier: "seo" | "social" | "advanced_seo" | "advanced_social" | "advanced_growth"; limits: number[] }> = [
    { tier: "seo", limits: [0, 0, 0, 0, 0, 0] },
    { tier: "social", limits: [28, 0, 0, 0, 28, 0] },
    { tier: "advanced_seo", limits: [0, 0, 0, 0, 0, 0] },
    { tier: "advanced_social", limits: [28, 0, 0, 0, 28, 28] },
    { tier: "advanced_growth", limits: [28, 0, 0, 1, 28, 28] },
  ];
  for (const { tier, limits } of v3EligibleTiers) {
    assert.match(v3Migration, new RegExp(`p_plan_tier = '${tier}' then`), `redeem RPC must handle the real current plan_tier=${tier}`);
    const expectedPrice = PLAN_DEFINITIONS[tier].priceCents;
    assert.ok(v3Migration.includes(`v_price_cents := ${expectedPrice};`), `expected v_price_cents := ${expectedPrice} for ${tier} — must match PLAN_DEFINITIONS.${tier}.priceCents exactly`);
    const expectedLimits = toArray(PLAN_LIMITS[tier]);
    assert.deepEqual(expectedLimits, limits, `test's own expected limits for ${tier} must match the real PLAN_LIMITS.${tier} (sanity check on the test itself)`);
    assert.ok(v3Migration.includes(`v_limits := array[${limits.join(", ")}];`), `expected v_limits := array[${limits.join(", ")}] for ${tier} — must match entitlements.ts PLAN_LIMITS.${tier}`);
    // Every real self-service tier must also be self-service per the TS source
    // of truth, or this migration would be granting a plan nobody can buy.
    assert.ok(getSelfServicePlan(tier as never), `${tier} must actually be a real, current self-service plan`);
  }
  // The legacy branches must still be present, byte-for-byte — this migration
  // is additive, never a replacement of the original commit's own coverage.
  for (const tier of ["starter", "growth", "business"] as const) {
    assert.match(v3Migration, new RegExp(`p_plan_tier = '${tier}' then`), `legacy plan_tier=${tier} must still be handled — additive, not a replacement`);
  }
  // The two one-time website plans are deliberately excluded (documented
  // reason: this RPC always grants a 30-day recurring subscriptions row).
  assert.doesNotMatch(v3Migration, /p_plan_tier = 'website_landing_page'/, "one-time website plans must not be routed through the recurring-subscription RPC");
  assert.doesNotMatch(v3Migration, /p_plan_tier = 'website_standard'/, "one-time website plans must not be routed through the recurring-subscription RPC");
  console.log("go-free-subscription-safety.test.ts: v3 catalog support migration matches the real TS plan/entitlement source — PASS");

  const billingPageForV3 = readCode("app", "app", "billing", "page.tsx");
  assert.doesNotMatch(billingPageForV3, /<option value="starter">/, "the dead legacy tier set must no longer be hardcoded into the GoFree dropdown");
  assert.doesNotMatch(billingPageForV3, /<option value="growth">/);
  assert.doesNotMatch(billingPageForV3, /<option value="business">/);
  assert.match(billingPageForV3, /goFreeEligiblePlans\.map/, "the dropdown must be built from the real self-service catalog, not a hardcoded list");
  assert.match(billingPageForV3, /GO_FREE_ELIGIBLE_TIERS/, "must scope GoFree eligibility to the RECURRING tiers the RPC actually supports");
  console.log("go-free-subscription-safety.test.ts: billing page no longer offers the dead legacy tier set — PASS");

  console.log("go-free-subscription-safety.test.ts: ALL PASS");
}

run();
