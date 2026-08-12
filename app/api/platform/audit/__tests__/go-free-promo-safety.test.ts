// Run with: node --experimental-strip-types app/api/platform/audit/__tests__/go-free-promo-safety.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateAuditGoFreeCode,
  hashPromoCode,
  normalizePromoCode,
  publicPromoMessage,
  isCustomPromoCodeFormat,
  isPromoFundedAudit,
} from "../../../../../lib/promo/go-free.ts";
import { isAuditCreditProvenanceEligible } from "../../../../../packages/payments-and-wallet/src/audit-credits.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  // --- helpers --------------------------------------------------------------
  assert.equal(normalizePromoCode("  beta100 "), "BETA100");
  assert.equal(hashPromoCode("BETA100"), hashPromoCode("beta100".toUpperCase()));
  assert.notEqual(hashPromoCode("BETA100"), hashPromoCode("BETA101"));
  assert.ok(isCustomPromoCodeFormat("BETA100"));
  assert.equal(isCustomPromoCodeFormat("AB"), false);
  const generated = generateAuditGoFreeCode();
  assert.match(generated, /^AUDIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(publicPromoMessage("expired"), "This code has expired.");
  assert.equal(publicPromoMessage("max_uses"), "This code has already been used.");
  assert.equal(publicPromoMessage("wrong_product"), "This code isn't available for this product.");
  assert.equal(publicPromoMessage("nope"), "This code is invalid.");

  // --- credit provenance ----------------------------------------------------
  assert.equal(
    isPromoFundedAudit({ fulfilment_source: "promo", actual_paid_cents: 0 }),
    true
  );
  assert.equal(
    isAuditCreditProvenanceEligible({
      fulfilment_source: "promo",
      actual_paid_cents: 0,
      audit_completed_at: new Date().toISOString(),
      credit_eligible_from: new Date().toISOString(),
      credit_expires_at: new Date(Date.now() + 86400000).toISOString(),
      credit_consumed_at: null,
      audit_fee_cents: 99900,
    }),
    false,
    "Go Free completed Audit must NOT grant ₹999 subscription credit"
  );
  assert.equal(
    isAuditCreditProvenanceEligible({
      fulfilment_source: "razorpay",
      actual_paid_cents: 99900,
      audit_completed_at: new Date().toISOString(),
      credit_eligible_from: new Date().toISOString(),
      credit_expires_at: new Date(Date.now() + 86400000).toISOString(),
      credit_consumed_at: null,
      audit_fee_cents: 99900,
    }),
    true,
    "cash-paid completed Audit remains credit-eligible"
  );
  assert.equal(
    isAuditCreditProvenanceEligible({
      fulfilment_source: null,
      actual_paid_cents: null,
      audit_completed_at: new Date().toISOString(),
      credit_eligible_from: new Date().toISOString(),
      credit_expires_at: new Date(Date.now() + 86400000).toISOString(),
      credit_consumed_at: null,
      audit_fee_cents: 99900,
    }),
    true,
    "legacy cash-paid rows (null provenance) remain eligible when credit window is set"
  );

  // --- migration invariants -------------------------------------------------
  const migration = read("supabase", "migrations", "20260813120000_admin_go_free_promo_codes.sql");
  assert.match(migration, /create table if not exists public\.promo_codes/);
  assert.match(migration, /create table if not exists public\.promo_redemptions/);
  assert.match(migration, /redeem_audit_go_free_code_v1/);
  assert.match(migration, /validate_audit_go_free_code_v1/);
  assert.match(migration, /fulfilment_source/);
  assert.match(migration, /actual_paid_cents/);
  assert.match(migration, /enforce_promo_audit_no_subscription_credit/);
  assert.match(migration, /credit_eligible_from := null/);
  assert.match(migration, /grant execute on function public\.redeem_audit_go_free_code_v1[\s\S]*to service_role/i);
  assert.match(migration, /revoke execute on function public\.redeem_audit_go_free_code_v1[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /create or replace function public\.reconcile_and_fulfill_razorpay_payment_v4/i);
  assert.match(migration, /Does NOT modify reconcile_and_fulfill_razorpay_payment_v4/);
  assert.match(migration, /promo_redemptions are immutable/);
  assert.match(migration, /payment_purpose = 'audit_fee'/);
  assert.match(migration, /amount_due_cents bigint not null check \(amount_due_cents = 0\)/);

  // --- redeem route: no Razorpay, server authority --------------------------
  const redeem = readCode("app", "api", "platform", "audit", "promo", "redeem", "route.ts");
  assert.match(redeem, /redeem_audit_go_free_code_v1/);
  assert.doesNotMatch(redeem, /createPaymentLink/);
  assert.doesNotMatch(redeem, /razorpay/i);
  assert.doesNotMatch(redeem, /CAPTURED/);
  assert.match(redeem, /promoCode/);
  assert.doesNotMatch(redeem, /discountCents\s*=\s*body/);
  assert.doesNotMatch(redeem, /amountDueCents\s*=\s*body/);
  assert.match(redeem, /enforcePromoRateLimit/);
  assert.match(redeem, /subscription_payment/);

  const validate = readCode("app", "api", "platform", "audit", "promo", "validate", "route.ts");
  assert.match(validate, /validate_audit_go_free_code_v1/);
  assert.match(validate, /enforcePromoRateLimit/);
  assert.match(validate, /amountDueCents:\s*0/);

  // --- admin security -------------------------------------------------------
  const adminList = readCode("app", "api", "platform", "admin", "promo-codes", "route.ts");
  assert.match(adminList, /platform_owner/);
  assert.match(adminList, /platform_admin/);
  assert.match(adminList, /requirePlatformStaff/);
  assert.match(adminList, /create_promo_code/);
  assert.doesNotMatch(adminList, /audit_reviewer/);
  assert.doesNotMatch(adminList, /finance_reviewer/);

  const adminOne = readCode("app", "api", "platform", "admin", "promo-codes", "[id]", "route.ts");
  assert.match(adminOne, /disable_promo_code/);
  assert.match(adminOne, /enable_promo_code/);
  assert.doesNotMatch(adminOne, /method === "DELETE"|export async function DELETE/);

  // --- checkout UI ----------------------------------------------------------
  const guest = readCode("app", "audit", "checkout", "GuestCheckoutForm.tsx");
  assert.match(guest, /Have a Go Free code/);
  assert.match(guest, /Continue Free/);
  assert.match(guest, /Pay ₹999 & Start/);
  assert.match(guest, /\/api\/platform\/audit\/promo\/redeem/);
  assert.match(guest, /\/api\/platform\/audit\/promo\/validate/);

  const authCheckout = readCode("app", "audit", "checkout", "CheckoutRedirect.tsx");
  assert.match(authCheckout, /Continue Free/);
  assert.match(authCheckout, /Pay ₹999 & Start/);
  assert.doesNotMatch(authCheckout, /useEffect[\s\S]*\/api\/platform\/audit\/checkout/);

  // --- credit package wiring ------------------------------------------------
  const credits = readCode("packages", "payments-and-wallet", "src", "audit-credits.ts");
  assert.match(credits, /isAuditCreditProvenanceEligible/);
  assert.match(credits, /fulfilment_source === "promo"/);

  // --- claim still rejects pending_payment ---------------------------------
  const claim = readCode("app", "api", "platform", "audit", "claim", "route.ts");
  assert.match(claim, /CLAIMABLE_STATUSES\s*=\s*\[["']paid["'],\s*["']in_review["'],\s*["']completed["']\]/);
  assert.equal(claim.includes("pending_payment") && /CLAIMABLE_STATUSES.*pending_payment/.test(claim), false);

  console.log("go-free-promo-safety.test.ts: PASS");
}

run();
