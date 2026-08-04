// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-webhook-events.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";
import {
  canTransitionPayment,
  assertPaymentTransition,
  InvalidPaymentTransitionError,
} from "../razorpay/payment-state-machine.ts";

function testWebhookSignatureVerification() {
  const secret = "live_webhook_secret_998877";
  const rawBody = JSON.stringify({
    entity: "event",
    account_id: "acc_112233",
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: { id: "plink_123", reference_id: "pl_ref_123", status: "paid", amount: 10000 },
      },
    },
  });

  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "wrong_sig_123", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, ""), false);
}

function testMonotonicPaymentTransitions() {
  assert.equal(canTransitionPayment("CREATED", "AUTHORIZED"), true);
  assert.equal(canTransitionPayment("AUTHORIZED", "CAPTURED"), true);
  assert.equal(canTransitionPayment("CAPTURED", "REFUNDED"), true);
  assert.equal(canTransitionPayment("CAPTURED", "PARTIALLY_REFUNDED"), true);

  assert.equal(canTransitionPayment("CAPTURED", "CREATED"), false, "Cannot move CAPTURED back to CREATED");
  assert.equal(canTransitionPayment("FAILED", "CAPTURED"), false, "Cannot move FAILED to CAPTURED");
  assert.equal(canTransitionPayment("REFUNDED", "CAPTURED"), false, "Cannot move REFUNDED back to CAPTURED");

  assert.throws(
    () => assertPaymentTransition("CAPTURED", "CREATED"),
    InvalidPaymentTransitionError
  );
}

function testMonotonicPaymentLinkStatuses() {
  const isTerminalLinkStatus = (status: string) => status === "paid" || status === "cancelled" || status === "expired";

  assert.equal(isTerminalLinkStatus("paid"), true);
  assert.equal(isTerminalLinkStatus("cancelled"), true);
  assert.equal(isTerminalLinkStatus("expired"), true);
  assert.equal(isTerminalLinkStatus("created"), false);
  assert.equal(isTerminalLinkStatus("partially_paid"), false);
}

function run() {
  testWebhookSignatureVerification();
  testMonotonicPaymentTransitions();
  testMonotonicPaymentLinkStatuses();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
