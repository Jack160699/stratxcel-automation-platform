// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-webhook-events.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { ServiceClient } from "../db.ts";
import {
  claimRazorpayWebhookEvent,
  markWebhookEventProcessed,
  processRazorpayWebhookEvent,
  DuplicateWebhookEventError,
  WebhookEventInProgressError,
} from "../razorpay/webhook-events.ts";
import { settlePaymentToWallet } from "../razorpay/settlement.ts";
import { markRefundProcessed } from "../razorpay/refunds.ts";
import { verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";
import { canTransitionPayment, assertPaymentTransition, InvalidPaymentTransitionError } from "../razorpay/payment-state-machine.ts";
import type { PaymentOrderRow } from "../razorpay/types.ts";

function testWebhookSignatureVerification() {
  const secret = "live_webhook_secret_998877";
  const rawBody = JSON.stringify({ entity: "event", account_id: "acc_112233", event: "payment_link.paid" });
  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "wrong_sig_123", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
}

async function testProductionClaimAndRetryBehavior() {
  const dbEvents = new Map<string, Record<string, unknown>>();

  const createQueryChain = (targetId: string, payloadToApply?: Record<string, unknown>) => {
    const chain = {
      eq: (_field: string, val: string) => createQueryChain(targetId || val, payloadToApply),
      maybeSingle: async () => ({ data: dbEvents.get(targetId) ?? null, error: null }),
      single: async () => ({ data: dbEvents.get(targetId) ?? null, error: null }),
      then: (resolve: (val: unknown) => void) => {
        if (payloadToApply && targetId) {
          const existing = dbEvents.get(targetId);
          if (existing) Object.assign(existing, payloadToApply);
        }
        return Promise.resolve({ data: dbEvents.get(targetId) ?? null, error: null }).then(resolve);
      },
    };
    return chain;
  };

  const mockDb = {
    from: (table: string) => {
      if (table === "razorpay_webhook_events") {
        return {
          select: () => ({
            eq: (_field: string, val: string) => createQueryChain(val),
          }),
          update: (fields: Record<string, unknown>) => ({
            eq: (_field: string, val: string) => createQueryChain(val, fields),
          }),
          insert: (fields: Record<string, unknown>) => {
            const id = `id_${Math.random()}`;
            const row = { id, ...fields };
            dbEvents.set(fields.provider_event_id as string, row);
            dbEvents.set(id, row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const eventId = "evt_prod_claim_test_100";

  // 1. First claim succeeds
  const claim1 = await claimRazorpayWebhookEvent(mockDb, { providerEventId: eventId, eventType: "payment_link.paid", payload: {} });
  assert.equal(claim1.claimed, true);
  assert.notEqual(claim1.token, null);

  // 2. Concurrent second claim during active lease throws WebhookEventInProgressError
  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockDb, { providerEventId: eventId, eventType: "payment_link.paid", payload: {} }),
    WebhookEventInProgressError
  );

  // 3. Mark processed
  await markWebhookEventProcessed(mockDb, claim1.eventRow.id, claim1.token);

  // 4. Subsequent claim throws DuplicateWebhookEventError
  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockDb, { providerEventId: eventId, eventType: "payment_link.paid", payload: {} }),
    DuplicateWebhookEventError
  );
}

async function testProductionSettlementIdempotency() {
  const ledgerEntries: Record<string, unknown>[] = [];

  const mockDb = {
    from: (table: string) => {
      if (table === "wallet_ledger_entries") {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => ({
              eq: (f2: string, v2: string) => ({
                eq: (f3: string, v3: string) => ({
                  maybeSingle: async () => {
                    const match = ledgerEntries.find(
                      (e) => e.tenant_id === v1 && e.reference_type === v2 && e.reference_id === v3
                    );
                    return { data: match ?? null, error: null };
                  },
                }),
              }),
            }),
          }),
          insert: (entry: Record<string, unknown>) => {
            const row = { id: `entry_${Date.now()}`, ...entry };
            ledgerEntries.push(row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
        };
      }
      if (table === "wallet_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: "t1", balance_cents: 0 }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { balance_cents: 5000 }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const mockOrder: PaymentOrderRow = {
    id: "order-uuid-999",
    tenant_id: "tenant-uuid-111",
    provider: "razorpay",
    provider_order_id: "order_123",
    provider_payment_id: "pay_123",
    amount_cents: 5000,
    currency: "INR",
    state: "CAPTURED",
    mode: "live",
    reference_type: "payment_link",
    reference_id: "pl_ref_123",
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // First settlement credits wallet exactly once
  const res1 = await settlePaymentToWallet(mockDb, mockOrder);
  assert.equal(res1.settled, true);
  assert.equal(ledgerEntries.length, 1);

  // Duplicate settlement attempt does NOT double-credit
  const res2 = await settlePaymentToWallet(mockDb, mockOrder);
  assert.equal(res2.settled, false);
  assert.equal(ledgerEntries.length, 1, "Ledger entry count remains 1");
}

async function testOutOfOrderRefundReconciliation() {
  const refundsDb = new Map<string, Record<string, unknown>>();
  const ledgerEntries: Record<string, unknown>[] = [];
  let orderState = "CAPTURED";

  const mockOrder: PaymentOrderRow = {
    id: "order-out-of-order-1",
    tenant_id: "tenant-out-of-order",
    provider: "razorpay",
    provider_order_id: null,
    provider_payment_id: "pay_ooo_100",
    amount_cents: 10000,
    currency: "INR",
    state: "CAPTURED",
    mode: "live",
    reference_type: "payment_link",
    reference_id: "pl_ref_ooo",
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const createRefundChain = (targetId: string) => ({
    eq: (f2?: string, v2?: string) => ({
      maybeSingle: async () => {
        const items = Array.from(refundsDb.values());
        const match = items.find((i) => i[targetId] === targetId || i.provider_refund_id === targetId || (f2 && i[f2] === v2));
        return { data: match ? { ...match, payment_orders: mockOrder } : null, error: null };
      },
    }),
    maybeSingle: async () => {
      const match = refundsDb.get(targetId);
      return { data: match ? { ...match, payment_orders: mockOrder } : null, error: null };
    },
    single: async () => {
      const match = refundsDb.get(targetId);
      return { data: match ? { ...match, payment_orders: mockOrder } : null, error: null };
    },
    then: (resolve: (val: unknown) => void) => {
      return Promise.resolve({ data: refundsDb.get(targetId) ?? null, error: null }).then(resolve);
    },
  });

  const mockDb = {
    from: (table: string) => {
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: (_f: string, v: string) => ({
              maybeSingle: async () => ({ data: v === "pay_ooo_100" || v === mockOrder.id ? mockOrder : null, error: null }),
              single: async () => ({ data: v === "pay_ooo_100" || v === mockOrder.id ? mockOrder : null, error: null }),
            }),
          }),
          update: (fields: Record<string, unknown>) => {
            if (fields.state) orderState = fields.state as string;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { ...mockOrder, state: orderState }, error: null }),
                }),
              }),
            };
          },
        };
      }
      if (table === "payment_refunds") {
        return {
          select: (_cols?: string) => ({
            eq: (_f1: string, v1: string) => createRefundChain(v1),
          }),
          insert: (fields: Record<string, unknown>) => {
            const id = `rfnd_id_${Math.random()}`;
            const row = { id, ...fields };
            if (fields.provider_refund_id) refundsDb.set(fields.provider_refund_id as string, row);
            refundsDb.set(id, row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
          update: (fields: Record<string, unknown>) => ({
            eq: (_f: string, v: string) => {
              const item = refundsDb.get(v);
              if (item) Object.assign(item, fields);
              return {
                eq: () => Promise.resolve({ data: item, error: null }),
                then: (resolve: Function) => resolve({ data: item, error: null }),
              };
            },
          }),
        };
      }
      if (table === "wallet_ledger_entries") {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => ({
              eq: (f2: string, v2: string) => ({
                eq: (f3: string, v3: string) => ({
                  maybeSingle: async () => {
                    const match = ledgerEntries.find((e) => e.tenant_id === v1 && e.reference_type === v2 && e.reference_id === v3);
                    return { data: match ?? null, error: null };
                  },
                }),
              }),
            }),
          }),
          insert: (entry: Record<string, unknown>) => {
            const row = { id: `entry_${Date.now()}`, ...entry };
            ledgerEntries.push(row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            };
          },
        };
      }
      if (table === "wallet_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: mockOrder.tenant_id, balance_cents: 10000 }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { balance_cents: 0 }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  // 1. Out-of-order: refund.processed arrives FIRST
  const procRes = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_ooo_999", payment_id: "pay_ooo_100", amount: 10000 } },
      },
    },
  });

  assert.equal(procRes.handled, true);
  assert.equal(procRes.actionTaken, "refund_processed_and_reconciled");
  assert.equal(ledgerEntries.length, 1, "Wallet ledger reversed exactly once on out-of-order refund.processed");
  assert.equal(refundsDb.get("rfnd_ooo_999")?.status, "PROCESSED");

  // 2. Out-of-order: refund.created arrives LATER
  const createRes = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.created",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_ooo_999", payment_id: "pay_ooo_100", amount: 10000 } },
      },
    },
  });

  assert.equal(createRes.handled, true);
  assert.equal(createRes.actionTaken, "refund_created_ignored_already_terminal", "refund.created must NOT move PROCESSED refund back to PENDING");
  assert.equal(refundsDb.get("rfnd_ooo_999")?.status, "PROCESSED");
  assert.equal(ledgerEntries.length, 1, "Wallet ledger count remains 1 (no double reversal)");
}

async function run() {
  testWebhookSignatureVerification();
  await testProductionClaimAndRetryBehavior();
  await testProductionSettlementIdempotency();
  await testOutOfOrderRefundReconciliation();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
