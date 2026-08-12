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
  // The guest path legitimately reads a body (email, optional GST-invoice
  // fields) — what must never happen is an amount coming from it.
  assert.equal(
    /amount(Cents|InRupees)?\s*[:=]\s*body\./.test(checkoutSource),
    false,
    "no amount field may ever be read from the request body"
  );
  assert.ok(/amountCents:\s*AUDIT_FEE_CENTS/.test(checkoutSource), "createPaymentLink must be called with the fixed fee constant");
  assert.ok(/paymentPurpose:\s*"audit_fee"/.test(checkoutSource), "purpose must be hardcoded to audit_fee, never derived from input");

  // --- 3. Gated by PAYMENTS_AUDIT_ENABLED only, and fails closed --------------
  assert.ok(/isPaymentFeatureEnabled\("PAYMENTS_AUDIT_ENABLED"\)/.test(checkoutSource), "checkout must check PAYMENTS_AUDIT_ENABLED");
  assert.ok(/if \(!isPaymentFeatureEnabled\("PAYMENTS_AUDIT_ENABLED"\)\)/.test(checkoutSource), "flag check must gate before any order/link is created");
  for (const otherFlag of ["PAYMENTS_SUBSCRIPTIONS_ENABLED", "PAYMENTS_CONTINUATION_PACKS_ENABLED", "PAYMENTS_DOMAINS_ENABLED"]) {
    assert.equal(checkoutSource.includes(otherFlag), false, `checkout route must not reference ${otherFlag} — enabling audit must never imply enabling it`);
  }

  // --- 4. No login wall pre-payment, but still no other payment surface ------
  // The whole point of this correction: POST /checkout must work for a
  // signed-out visitor. (GET, used only by the authenticated /app/audit hub,
  // legitimately still requires a session — scope the check to POST alone.)
  const postHandlerSource = checkoutSource.slice(checkoutSource.indexOf("export async function POST"), checkoutSource.indexOf("export async function GET"));
  assert.equal(/if \(!user\) return Response\.json/.test(postHandlerSource), false, "POST /audit/checkout must not reject unauthenticated callers — that reintroduces the login wall this task removes");
  assert.ok(/if \(user\)/.test(postHandlerSource), "POST must branch on whether a session exists rather than requiring one");
  assert.equal(/wallet_topup|continuation_pack|domain_purchase|domain_renewal|subscription_payment/.test(checkoutSource), false, "checkout route must not touch any other payment purpose");

  // Guest path: email is required and validated; nothing else about the
  // request is trusted for the charge itself.
  assert.ok(/EMAIL_PATTERN\.test\(email\)/.test(checkoutSource), "guest checkout must validate the email format server-side");
  assert.ok(/status: 400.*valid email|valid email.*status: 400|A valid email address is required/s.test(checkoutSource), "guest checkout must reject a missing/invalid email");
  assert.ok(/guestEmail = email/.test(checkoutSource), "guest email must be persisted onto the order for the later claim check");

  // The audit page itself must no longer gate on auth before payment.
  const auditCheckoutPageSource = readCode("app", "audit", "checkout", "page.tsx");
  assert.equal(/redirect\(["']\/login/.test(auditCheckoutPageSource), false, "/audit/checkout must not redirect a signed-out visitor to /login");
  assert.ok(/NEXT_PUBLIC_SUPABASE_URL/.test(auditCheckoutPageSource) && /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(auditCheckoutPageSource), "/audit/checkout must render a recoverable guest entry when auth configuration is unavailable");

  // --- 4b. Claim: only a genuinely paid, email-matched, single-use purchase
  //         can ever be attached to an account -------------------------------
  const claimSource = readCode("app", "api", "platform", "audit", "claim", "route.ts");
  assert.ok(/CLAIMABLE_STATUSES\s*=\s*\[["']paid["'],\s*["']in_review["'],\s*["']completed["']\]/.test(claimSource), "only paid/in_review/completed orders may be claimed");
  assert.equal(claimSource.includes("pending_payment") && /CLAIMABLE_STATUSES.*pending_payment/.test(claimSource), false, "pending_payment must never be claimable");
  assert.ok(/guest_email.*verifiedEmail|verifiedEmail.*guest_email/.test(claimSource), "claim must compare the order's guest_email against the caller's own verified email");
  assert.ok(/status: 403/.test(claimSource), "an email mismatch must be rejected, not silently allowed");
  assert.ok(/claimed_at/.test(claimSource), "claim must be recorded so it cannot be reused");
  assert.equal(/tenantId\s*:\s*body\.|body\.tenantId/.test(claimSource), false, "claim must never take a tenantId from the request body — only the order's own tenant_id is used");

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
  assert.ok(/auditIntakeMissingFields\(order\)/.test(intakeSource), "starting review must validate the persisted intake on the server");
  assert.ok(/order\.status !== "paid"/.test(intakeSource), "intake must become immutable once review has started");

  // --- 6b. Staff delivery requires a valid report in both API and database
  const completeSource = readCode("app", "api", "platform", "audit", "complete", "route.ts");
  assert.ok(/normalizeAuditDeliveryReport\(reportData\)/.test(completeSource), "completion must validate the customer deliverable");
  assert.ok(/order\.status !== "in_review"/.test(completeSource), "staff must not skip the customer-started review state");
  assert.ok(/report_data: report/.test(completeSource), "the validated report must be saved before completion");
  const invariantMigration = readCode("supabase", "migrations", "20260812120051_audit_report_delivery_invariant.sql");
  assert.ok(/audit_report_required_before_completion/.test(invariantMigration), "database must reject completion without a report");
  assert.ok(/before update of status on public\.audit_orders/.test(invariantMigration), "the delivery invariant must guard audit order state transitions");

  const staffQueue = readCode("app", "admin", "(shell)", "audit-requests", "page.tsx");
  assert.ok(/\.from\("audit_orders"\)/.test(staffQueue), "staff delivery must operate on canonical paid audit orders");
  assert.equal(/\.from\("public_audit_requests"\)/.test(staffQueue), false, "legacy lead requests must not power paid Audit delivery");

  // --- 7. No service-role key leaks into any client-shipped file -------------
  for (const file of [
    ["app", "audit", "page.tsx"],
    ["app", "audit", "AuditCheckoutCta.tsx"],
    ["app", "audit", "checkout", "CheckoutRedirect.tsx"],
    ["app", "audit", "checkout", "GuestCheckoutForm.tsx"],
    ["app", "audit", "access", "ClaimEmailOtpForm.tsx"],
    ["app", "audit", "access", "ClaimAndContinue.tsx"],
    ["app", "app", "audit", "page.tsx"],
    ["app", "app", "audit", "IntakeWizard.tsx"],
  ]) {
    const source = read(...file);
    assert.equal(/SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/.test(source), false, `${file.join("/")} must not reference a server secret`);
  }

  // --- 8. No fabricated activity numbers on the public sign-in page ----------
  const loginPageSource = read("app", "login", "page.tsx");
  for (const fake of ["Workspace #819", "2 Missions", "42 Inquiries"]) {
    assert.equal(loginPageSource.includes(fake), false, `login page must not show the fabricated "${fake}"`);
  }

  console.log("audit-payment-safety.test.ts: ALL PASS (GST math reconstructs the exact charge, ₹999 hardcoded server-side, PAYMENTS_AUDIT_ENABLED isolated from other payment flags, generic payment-links stays wallet-only, intake blocked before payment, guest checkout has no login wall + validated email, claim requires paid status + verified email match, no secrets in client code, no fabricated login metrics)");
}

run();
