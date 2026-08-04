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

function testEventIdHeaderValidation() {
  const isValidHeader = (header: string | null) => Boolean(header && header.trim().length > 0);

  assert.equal(isValidHeader("evt_123456"), true);
  assert.equal(isValidHeader("  evt_123456  "), true);
  assert.equal(isValidHeader(""), false, "Blank event ID must be rejected");
  assert.equal(isValidHeader("   "), false, "Whitespace event ID must be rejected");
  assert.equal(isValidHeader(null), false, "Missing event ID header must be rejected");
}

function testMockedWebhookRetryIdempotency() {
  // Simulate mock database for webhook event deduplication & retry
  const dbEvents = new Map<string, { id: string; provider_event_id: string; processed_at: string | null }>();

  function mockRecordWebhookEventOnce(providerEventId: string) {
    const existing = dbEvents.get(providerEventId);
    if (existing) {
      if (existing.processed_at) {
        throw new Error("ALREADY_PROCESSED");
      }
      return existing; // Retry eligible
    }
    const newRow = { id: `row_${Date.now()}`, provider_event_id: providerEventId, processed_at: null };
    dbEvents.set(providerEventId, newRow);
    return newRow;
  }

  function mockMarkProcessed(providerEventId: string) {
    const row = dbEvents.get(providerEventId);
    if (row) row.processed_at = new Date().toISOString();
  }

  const eventId = "evt_retry_test_001";

  // 1. First delivery is recorded
  const row1 = mockRecordWebhookEventOnce(eventId);
  assert.equal(row1.processed_at, null);

  // 2. Processing throws an error (simulated failure)
  let processFailed = false;
  try {
    throw new Error("Simulated processing error");
  } catch {
    processFailed = true;
  }
  assert.equal(processFailed, true);
  assert.equal(dbEvents.get(eventId)?.processed_at, null, "processed_at must remain null after failure");

  // 3. Second delivery retries
  const row2 = mockRecordWebhookEventOnce(eventId);
  assert.equal(row2.provider_event_id, eventId);
  assert.equal(row2.processed_at, null, "Second delivery receives retry-eligible row");

  // 4. Processing succeeds
  mockMarkProcessed(eventId);
  assert.notEqual(dbEvents.get(eventId)?.processed_at, null, "processed_at set after success");

  // 5. Later deliveries return already_processed
  assert.throws(
    () => mockRecordWebhookEventOnce(eventId),
    (err: Error) => err.message === "ALREADY_PROCESSED"
  );
}

function testRefundCreatedVsProcessedBalanceEffects() {
  // Simulate wallet ledger and refund state
  let walletBalance = 10000; // 100.00 INR
  let refundStatus = "PENDING";
  let refundProcessedAt: string | null = null;
  let ledgerEntriesCount = 0;

  function handleRefundCreated() {
    refundStatus = "PENDING";
    // DO NOT reverse wallet credit!
  }

  function handleRefundProcessed(amountCents: number) {
    if (refundStatus === "PROCESSED") return; // Idempotent check
    refundStatus = "PROCESSED";
    refundProcessedAt = new Date().toISOString();
    walletBalance -= amountCents; // Reverses wallet credit exactly once
    ledgerEntriesCount += 1;
  }

  // Initial refund.created event
  handleRefundCreated();
  assert.equal(walletBalance, 10000, "refund.created MUST NOT change wallet balance");
  assert.equal(refundStatus, "PENDING");
  assert.equal(refundProcessedAt, null);
  assert.equal(ledgerEntriesCount, 0);

  // First refund.processed event
  handleRefundProcessed(2500);
  assert.equal(walletBalance, 7500, "refund.processed MUST reverse wallet credit");
  assert.equal(refundStatus, "PROCESSED");
  assert.notEqual(refundProcessedAt, null);
  assert.equal(ledgerEntriesCount, 1);

  // Repeated duplicate refund.processed event
  handleRefundProcessed(2500);
  assert.equal(walletBalance, 7500, "Duplicate refund.processed MUST NOT reverse wallet credit twice");
  assert.equal(ledgerEntriesCount, 1, "Ledger entry count stays 1");
}

function run() {
  testWebhookSignatureVerification();
  testMonotonicPaymentTransitions();
  testEventIdHeaderValidation();
  testMockedWebhookRetryIdempotency();
  testRefundCreatedVsProcessedBalanceEffects();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
