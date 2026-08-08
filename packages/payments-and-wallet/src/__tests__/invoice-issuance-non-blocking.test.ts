// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/invoice-issuance-non-blocking.test.ts
//
// GST invoice/credit-note issuance must never affect payment/webhook outcomes — a
// failure to write one is a compliance follow-up item, not a reason to make
// Razorpay re-deliver an already-fulfilled payment or refund event. Issuance
// deliberately lives one layer up from processRazorpayWebhookEvent (in the webhook
// route), specifically so that function's own RPC call shape/count — covered by
// razorpay-webhook-events.test.ts — never has to change for this feature. This is a
// static check on the route source (safe: no live DB in this environment) plus a
// direct unit check of the exact GST split math the invoice RPC uses.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitGstInclusive } from "../../../../lib/payments/gst.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webhookRouteSource = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "app", "api", "webhook", "razorpay", "route.ts"), "utf8");
const migrationSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260807223455_subscriptions_lifecycle_billing_gst.sql"),
  "utf8"
);

function run() {
  // --- 1. The webhook route attempts invoice/credit-note issuance, wrapped so it
  //        can never affect the response it already sent for a handled event. -----
  assert.ok(webhookRouteSource.includes("issueBillingRecordsBestEffort"), "the webhook route must attempt best-effort billing-record issuance");
  assert.ok(webhookRouteSource.includes("issueInvoiceForPaymentOrder"), "must call the invoice issuance helper");
  assert.ok(webhookRouteSource.includes("issue_credit_note_for_refund"), "must call the credit-note issuance RPC");

  const helperBody = webhookRouteSource.slice(
    webhookRouteSource.indexOf("async function issueBillingRecordsBestEffort"),
    webhookRouteSource.indexOf("export async function GET")
  );
  assert.ok(/try\s*{/.test(helperBody), "issuance must be wrapped in try/catch");
  assert.ok(/catch \(err\)/.test(helperBody), "issuance must be wrapped in try/catch");
  assert.equal(/return Response\.json/.test(helperBody), false, "the best-effort helper must never itself produce an HTTP response — only the caller does, unconditionally");

  // --- 2. The call site runs strictly after the event was already marked
  //        processed — a billing-record failure can never move the claim back to
  //        "unprocessed" and trigger a duplicate-fulfilment retry. -----------------
  const markProcessedIdx = webhookRouteSource.indexOf("markWebhookEventProcessed(supabase, claim.eventId, claim.token)");
  const bestEffortCallIdx = webhookRouteSource.indexOf("issueBillingRecordsBestEffort(supabase, processResult)");
  assert.ok(markProcessedIdx > 0 && bestEffortCallIdx > markProcessedIdx, "billing-record issuance must run only after the webhook event is already marked processed");

  // --- 3. The invoice RPC is idempotent (unique on payment_order_id) and its
  //        persisted total_cents always equals the amount actually charged. -------
  assert.ok(migrationSource.includes("invoices_payment_order_unique_idx"), "invoice issuance must be idempotent per payment order");
  assert.ok(migrationSource.includes("invoices_gst_split_exact"), "invoices table must enforce taxable + gst == total at the database level");

  // --- 4. Same GST math as checkout display, applied server-side to the actual
  //        captured amount (never re-derived from a client-supplied price). -------
  for (const cents of [99900, 949900, 1899900]) {
    const split = splitGstInclusive(cents);
    assert.equal(split.taxableValueCents + split.gstCents, cents);
  }

  console.log("invoice-issuance-non-blocking.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
