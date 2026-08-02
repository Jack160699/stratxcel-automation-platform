/**
 * Sample Razorpay webhook payloads matching Razorpay's documented webhook
 * shape (https://razorpay.com/docs/webhooks/payloads/payments/). Used by
 * tests and available for shadow-mode manual verification once test
 * credentials are configured. Both legacy routes discovered in
 * ai-automation-system (apps/ai-os and apps/stratxcel-os) consume this
 * same provider-standard wire format — the difference between them (per
 * docs/discovery/REPOSITORY_CAPABILITY_MATRIX.md) is in downstream
 * handling, not the payload shape, so one fixture set covers both.
 */
export const PAYMENT_CAPTURED_FIXTURE = {
  entity: "event",
  account_id: "acc_test123",
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_test_captured_1",
        entity: "payment",
        amount: 150000,
        currency: "INR",
        status: "captured",
        order_id: "order_test_1",
        method: "card",
        email: "customer@example.com",
        contact: "+919999999999",
      },
    },
  },
  created_at: 1780000000,
};

export const PAYMENT_FAILED_FIXTURE = {
  entity: "event",
  account_id: "acc_test123",
  event: "payment.failed",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_test_failed_1",
        entity: "payment",
        amount: 150000,
        currency: "INR",
        status: "failed",
        order_id: "order_test_2",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Payment failed",
      },
    },
  },
  created_at: 1780000100,
};

export const REFUND_PROCESSED_FIXTURE = {
  entity: "event",
  account_id: "acc_test123",
  event: "refund.processed",
  contains: ["refund"],
  payload: {
    refund: {
      entity: {
        id: "rfnd_test_1",
        entity: "refund",
        amount: 150000,
        currency: "INR",
        payment_id: "pay_test_captured_1",
        status: "processed",
      },
    },
  },
  created_at: 1780000200,
};
