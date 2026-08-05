import assert from "node:assert/strict";

/**
 * Purpose Safety and RPC Path Invariants Test Suite.
 */
async function testPaymentLinkPaidV4RpcPaths() {
  const { processRazorpayWebhookEvent } = await import("../razorpay/webhook-events.ts");

  const basePayload = {
    eventType: "payment_link.paid",
    payload: {
      payload: {
        payment_link: { entity: { id: "plink_test_100", reference_id: "pl_ref_100", amount: 5000, currency: "INR", status: "paid" } },
        payment: { entity: { id: "pay_test_100", amount: 5000, currency: "INR", status: "captured" } },
      },
    },
  };

  // 1. Successful atomic v4 RPC execution
  const mockDbV4Success = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: true, already_fulfilled: false, purpose: "wallet_topup" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res1 = await processRazorpayWebhookEvent(mockDbV4Success, basePayload);
  assert.equal(res1.handled, true);
  assert.equal(res1.actionTaken, "payment_fulfilled_v4_atomic");

  // 2. Already fulfilled atomic v4 RPC execution
  const mockDbV4AlreadyFulfilled = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: true, already_fulfilled: true, purpose: "wallet_topup" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res2 = await processRazorpayWebhookEvent(mockDbV4AlreadyFulfilled, basePayload);
  assert.equal(res2.handled, true);
  assert.equal(res2.actionTaken, "payment_already_fulfilled");

  // 3. Atomic v4 RPC returns reconciliation mismatch failure -> handled = false
  const mockDbV4Mismatch = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: false, reason: "amount_or_currency_mismatch" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res3 = await processRazorpayWebhookEvent(mockDbV4Mismatch, basePayload);
  assert.equal(res3.handled, false);
  assert.equal(res3.actionTaken, "reconciliation_failed_amount_or_currency_mismatch");

  // 4. Atomic v4 RPC DB error -> throws for webhook retry
  const mockDbV4DbErr = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: null, error: { message: "PostgreSQL deadlock / timeout" } };
      }
      return { data: null, error: null };
    },
  } as any;

  await assert.rejects(
    () => processRazorpayWebhookEvent(mockDbV4DbErr, basePayload),
    (err: Error) => err.message.includes("reconcile_and_fulfill_razorpay_payment_v4 RPC failed")
  );

  console.log("razorpay-rpc-paths.test.ts: ALL PASS (v4 atomic RPC path invariants verified)");
}

testPaymentLinkPaidV4RpcPaths().catch((err) => {
  console.error("RPC Paths Test Suite Failed:", err);
  process.exit(1);
});
