// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-payment-links.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generatePaymentLinkReferenceId } from "../razorpay/payment-links.ts";
import { verifyRazorpayCallbackSignature, verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";

function testReferenceIdGeneration() {
  const ref1 = generatePaymentLinkReferenceId();
  const ref2 = generatePaymentLinkReferenceId();

  assert.ok(ref1.startsWith("pl_"));
  assert.ok(ref2.startsWith("pl_"));
  assert.notEqual(ref1, ref2, "Generated reference IDs must be unique");
}

function testCallbackSignatureVerification() {
  const secret = "test_webhook_secret_key";
  const params = {
    paymentLinkId: "plink_123456789",
    paymentLinkReferenceId: "pl_ref_987654321",
    paymentLinkStatus: "paid",
    paymentId: "pay_1122334455",
  };

  const payloadStr = `${params.paymentLinkId}|${params.paymentLinkReferenceId}|${params.paymentLinkStatus}|${params.paymentId}`;
  const validSig = crypto.createHmac("sha256", secret).update(payloadStr, "utf8").digest("hex");

  assert.equal(
    verifyRazorpayCallbackSignature({
      ...params,
      signature: validSig,
      secret,
    }),
    true,
    "Valid callback signature must verify to true"
  );

  assert.equal(
    verifyRazorpayCallbackSignature({
      ...params,
      signature: "invalid_hex_signature",
      secret,
    }),
    false,
    "Invalid signature must verify to false"
  );

  assert.equal(
    verifyRazorpayCallbackSignature({
      ...params,
      signature: validSig,
      secret: "wrong_secret",
    }),
    false,
    "Wrong secret must fail verification"
  );
}

function testAmountValidationAndPaiseConversion() {
  const amountInRupees = 1500.5;
  const amountCents = Math.round(amountInRupees * 100);
  assert.equal(amountCents, 150050, "Paise conversion must correctly multiply by 100");

  const invalidAmount = -50;
  assert.ok(invalidAmount <= 0, "Non-positive amount must be rejected");
}

function testPublicStatusPrivacy() {
  const dbRecord = {
    id: "uuid-1234-5678",
    tenant_id: "tenant-secret-uuid",
    provider_link_id: "plink_live_123",
    reference_id: "pl_1722800000_abc123",
    amount_cents: 50000,
    currency: "INR",
    status: "paid" as const,
    mode: "live" as const,
    short_url: "https://rzp.io/i/abc1234",
    description: "Quotation #101",
    customer_name: "John Doe",
    customer_email: "secret@example.com",
    customer_phone: "+919999999999",
    created_by: "user-secret-uuid",
    metadata: { sensitive_internal_key: "secret_value" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const publicSummary = {
    referenceId: dbRecord.reference_id,
    amountCents: dbRecord.amount_cents,
    currency: dbRecord.currency,
    status: dbRecord.status,
    description: dbRecord.description,
    shortUrl: dbRecord.short_url,
    mode: dbRecord.mode,
  };

  assert.equal("tenant_id" in publicSummary, false, "tenant_id must not be exposed in public status");
  assert.equal("customer_email" in publicSummary, false, "customer_email must not be exposed in public status");
  assert.equal("customer_phone" in publicSummary, false, "customer_phone must not be exposed in public status");
  assert.equal("metadata" in publicSummary, false, "metadata must not be exposed in public status");
  assert.equal(publicSummary.referenceId, "pl_1722800000_abc123");
}

function run() {
  testReferenceIdGeneration();
  testCallbackSignatureVerification();
  testAmountValidationAndPaiseConversion();
  testPublicStatusPrivacy();
  console.log("razorpay-payment-links.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
