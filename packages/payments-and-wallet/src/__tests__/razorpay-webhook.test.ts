// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-webhook.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";

function run() {
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { id: "pay_test123" } });
  const secret = "test-webhook-secret";
  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "deadbeef", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, ""), false);

  const wrongSig = crypto.createHmac("sha256", "wrong-secret").update(rawBody, "utf8").digest("hex");
  assert.equal(verifyRazorpayWebhookSignature(rawBody, wrongSig, secret), false);

  console.log("razorpay-webhook.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
