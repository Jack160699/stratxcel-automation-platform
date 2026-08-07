// Run with: node --experimental-strip-types app/api/platform/audit/__tests__/audit-payment-safety.test.ts
//
// Targeted safety checks for the payment-first ₹999 Audit release. Does not
// re-test the underlying Razorpay adapter, webhook signature verification,
// or reconcile_and_fulfill_razorpay_payment_v4 — those are exercised by
// packages/payments-and-wallet/src/__tests__/razorpay-test-mode-isolation.test.ts
// and payment-fulfilment-safety.test.ts and are unmodified by this task.
// This file only covers what this task actually changed: the checkout route,
// the intake route, and the GST display math.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitGstInclusive, formatCentsAsRupees } from "../../../../../lib/payments/gst.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  // --- 1. GST math never changes the payable total ---------------------------
  for (const totalCents of [99900, 949900, 1899900, 2399900]) {
    const { taxableValueCents, gstCents, totalCents: total } = splitGstInclusive(totalCents);
    assert.equal(taxableValueCents + gstCents, totalCents, `taxable + GST must reconstruct the exact total for ${totalCents}`);
    assert.equal(total, totalCents, "splitGstInclusive must echo the input total unchanged");
    assert.ok(taxableValueCents > 0 && gstCents > 0, "both components must be positive");
  }
  // The brief's worked example: ₹999 -> ₹846.61 taxable + ₹152.39 GST.
  const example = splitGstInclusive(99900);
  assert.equal(formatCentsAsRupees(example.taxableValueCents), "₹846.61");
  assert.equal(formatCentsAsRupees(example.gstCents), "₹152.39");
  assert.equal(formatCentsAsRupees(example.totalCents), "₹999.00");
  assert.throws(() => splitGstInclusive(0), "zero is not a valid charge");
  assert.throws(() => splitGstInclusive(-100), "negative is not a valid charge");
  assert.throws(() => splitGstInclusive(99900.5), "must be an integer number of paise");

  // --- 2. Checkout route: the ₹999 amount is hardcoded, never client-supplied
  const checkoutSource = readCode("app", "api", "platform", "audit", "checkout", "route.ts");
  assert.ok(/AUDIT_FEE_CENTS\s*=\s*99900/.test(checkoutSource), "audit fee must be the literal 99900 paise (₹999)");
  assert.equal(
    /await request\.json\(\)/.test(checkoutSource),
    false,
    "POST /audit/checkout must not read a request body at all — nothing about the charge is attacker-controlled"
  );
  assert.ok(/amountCents:\s*AUDIT_FEE_CENTS/.test(checkoutSource), "createPaymentLink must be called with the fixed fee constant");
  assert.ok(/paymentPurpose:\s*"audit_fee"/.test(checkoutSource), "purpose must be hardcoded to audit_fee, never derived from input");

  // --- 3. Gated by PAYMENTS_AUDIT_ENABLED only, and fails closed --------------
  assert.ok(/isPaymentFeatureEnabled\("PAYMENTS_AUDIT_ENABLED"\)/.test(checkoutSource), "checkout must check PAYMENTS_AUDIT_ENABLED");
  assert.ok(/if \(!isPaymentFeatureEnabled\("PAYMENTS_AUDIT_ENABLED"\)\)/.test(checkoutSource), "flag check must gate before any order/link is created");
  for (const otherFlag of ["PAYMENTS_SUBSCRIPTIONS_ENABLED", "PAYMENTS_CONTINUATION_PACKS_ENABLED", "PAYMENTS_DOMAINS_ENABLED"]) {
    assert.equal(checkoutSource.includes(otherFlag), false, `checkout route must not reference ${otherFlag} — enabling audit must never imply enabling it`);
  }

  // --- 4. Authenticated only, and reads no other payment surface -------------
  assert.ok(/getUser\(\)/.test(checkoutSource), "checkout must require a real session");
  assert.ok(/if \(!user\)/.test(checkoutSource), "checkout must reject unauthenticated calls");
  assert.equal(/wallet_topup|continuation_pack|domain_purchase|domain_renewal|subscription_payment/.test(checkoutSource), false, "checkout route must not touch any other payment purpose");

  // --- 5. The generic payment-links endpoint stays wallet-only, unreachable by
  //        public Audit customers for arbitrary-purpose/arbitrary-amount links
  const genericLinksSource = readCode("app", "api", "platform", "payments", "links", "route.ts");
  assert.ok(/paymentPurpose:\s*"wallet_topup"/.test(genericLinksSource), "the generic payment-links route must still be hardcoded to wallet_topup");
  assert.equal(genericLinksSource.includes("audit_fee"), false, "the generic payment-links route must not accept audit_fee");

  // --- 6. Intake route: no writes before payment, tenant re-derived server-side
  const intakeSource = readCode("app", "api", "platform", "audit", "intake", "route.ts");
  assert.ok(/status === "pending_payment"/.test(intakeSource), "intake must check for pending_payment");
  assert.ok(/status: 402/.test(intakeSource), "unpaid intake attempts must be rejected with 402, not silently accepted");
  assert.equal(/tenantId\s*[:=]\s*body\.|body\.tenantId/.test(intakeSource), false, "intake must never take tenantId from the request body");
  assert.ok(/listMembershipsForUser\(supabase, user\.id\)/.test(intakeSource), "tenant must be re-derived from the caller's own session on every call");

  // --- 7. No service-role key leaks into any client-shipped file -------------
  for (const file of [
    ["app", "audit", "page.tsx"],
    ["app", "audit", "AuditCheckoutCta.tsx"],
    ["app", "audit", "checkout", "CheckoutRedirect.tsx"],
    ["app", "app", "audit", "page.tsx"],
    ["app", "app", "audit", "IntakeWizard.tsx"],
  ]) {
    const source = read(...file);
    assert.equal(/SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/.test(source), false, `${file.join("/")} must not reference a server secret`);
  }

  console.log("audit-payment-safety.test.ts: ALL PASS (GST math reconstructs the exact charge, ₹999 hardcoded server-side, PAYMENTS_AUDIT_ENABLED isolated from other payment flags, generic payment-links stays wallet-only, intake blocked before payment, no secrets in client code)");
}

run();
