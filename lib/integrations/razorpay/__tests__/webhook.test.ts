// Run with: node --experimental-strip-types lib/integrations/razorpay/__tests__/webhook.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpayWebhookSignature } from "../webhook.ts";

function run() {
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { id: "pay_test123" } });
  const secret = "test-webhook-secret";
  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "deadbeef", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, ""), false);

  // Wrong secret must fail even with a well-formed hex signature
  const wrongSig = crypto.createHmac("sha256", "wrong-secret").update(rawBody, "utf8").digest("hex");
  assert.equal(verifyRazorpayWebhookSignature(rawBody, wrongSig, secret), false);

  console.log("webhook.test.ts (razorpay): ALL PASS");
}

run();
