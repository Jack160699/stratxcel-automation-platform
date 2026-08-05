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

  // 5. Pre-mutation rejection: Unsupported purpose
  const mockDbV4Unsupported = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: false, reason: "unsupported_payment_purpose" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res5 = await processRazorpayWebhookEvent(mockDbV4Unsupported, basePayload);
  assert.equal(res5.handled, false);
  assert.equal(res5.actionTaken, "reconciliation_failed_unsupported_payment_purpose");

  // 6. Pre-mutation rejection: Product not found (subscription)
  const mockDbV4NoSub = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: false, reason: "subscription_not_found" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res6 = await processRazorpayWebhookEvent(mockDbV4NoSub, basePayload);
  assert.equal(res6.handled, false);
  assert.equal(res6.actionTaken, "reconciliation_failed_subscription_not_found");

  // 7. Pre-mutation rejection: Unknown plan tier
  const mockDbV4BadPlan = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: false, reason: "unknown_plan_tier" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res7 = await processRazorpayWebhookEvent(mockDbV4BadPlan, basePayload);
  assert.equal(res7.handled, false);
  assert.equal(res7.actionTaken, "reconciliation_failed_unknown_plan_tier");

  // 8. Pre-mutation rejection: Subscription expected amount mismatch (audit credit price revalidation)
  const mockDbV4SubAmountMismatch = {
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        return { data: { fulfilled: false, reason: "subscription_expected_amount_mismatch" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;

  const res8 = await processRazorpayWebhookEvent(mockDbV4SubAmountMismatch, basePayload);
  assert.equal(res8.handled, false);
  assert.equal(res8.actionTaken, "reconciliation_failed_subscription_expected_amount_mismatch");

  console.log("razorpay-rpc-paths.test.ts: ALL PASS (v4 atomic RPC path invariants & pre-mutation rejections verified)");
}

testPaymentLinkPaidV4RpcPaths().catch((err) => {
  console.error("RPC Paths Test Suite Failed:", err);
  process.exit(1);
});
