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
import { verifyRazorpayWebhookSignature } from "../razorpay/webhook.ts";
import type { PaymentOrderRow } from "../razorpay/types.ts";

function testWebhookSignatureVerification() {
  const secret = "live_webhook_secret_998877";
  const rawBody = JSON.stringify({ entity: "event", account_id: "acc_112233", event: "payment_link.paid" });
  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "wrong_sig_123", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
}

async function testMultipleEventsForSamePaymentLinkSingleCredit() {
  const ordersDb = new Map<string, Record<string, unknown>>();
  const ledgerEntries: Record<string, unknown>[] = [];
  let walletBalance = 0;

  const mockLink = {
    id: "link_business_123",
    tenant_id: "tenant_biz_1",
    amount_cents: 15000,
    currency: "INR",
    status: "created",
    payment_purpose: "wallet_topup",
    mode: "live",
    reference_id: "pl_ref_biz_100",
  };

  const createQueryChain = (key: string) => ({
    eq: (_f2: string, v2: string) => createQueryChain(`${key}:${v2}`),
    maybeSingle: async () => {
      if (key.includes("payment_links")) return { data: mockLink, error: null };
      if (key.includes("payment_orders")) {
        const orderKey = `tenant_biz_1:razorpay:payment_link:pl_ref_biz_100`;
        return { data: ordersDb.get(orderKey) ?? null, error: null };
      }
      return { data: null, error: null };
    },
    single: async () => {
      const orderKey = `tenant_biz_1:razorpay:payment_link:pl_ref_biz_100`;
      return { data: ordersDb.get(orderKey) ?? null, error: null };
    },
  });

  const mockDb = {
    from: (table: string) => {
      if (table === "payment_links") {
        return {
          select: () => createQueryChain("payment_links"),
          update: () => ({
            eq: () => Promise.resolve({ data: mockLink, error: null }),
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => createQueryChain("payment_orders"),
          insert: (fields: Record<string, unknown>) => {
            const orderKey = `${fields.tenant_id}:${fields.provider}:${fields.reference_type}:${fields.reference_id}`;
            if (ordersDb.has(orderKey)) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { code: "23505", message: "Business ref unique collision" } }),
                }),
              };
            }
            const newOrder = { id: "order_biz_1", ...fields };
            ordersDb.set(orderKey, newOrder);
            return {
              select: () => ({
                single: async () => ({ data: newOrder, error: null }),
              }),
            };
          },
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
            walletBalance += entry.amount_cents as number;
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
              maybeSingle: async () => ({ data: { tenant_id: "tenant_biz_1", balance_cents: walletBalance }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { balance_cents: walletBalance }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const eventPayload = {
    payload: {
      payment_link: { entity: { id: "plink_live_biz_1", reference_id: "pl_ref_biz_100" } },
      payment: { entity: { id: "pay_live_biz_1" } },
    },
  };

  // Webhook Event 1 (evt_1)
  const res1 = await processRazorpayWebhookEvent(mockDb, { eventType: "payment_link.paid", payload: eventPayload });
  assert.equal(res1.handled, true);
  assert.equal(ordersDb.size, 1, "Exactly 1 payment_order created");
  assert.equal(ledgerEntries.length, 1, "Exactly 1 credit_purchase ledger entry");
  assert.equal(walletBalance, 15000, "Wallet balance increased by 15000 cents");

  // Webhook Event 2 (evt_2 - separate event ID for same payment link)
  const res2 = await processRazorpayWebhookEvent(mockDb, { eventType: "payment_link.paid", payload: eventPayload });
  assert.equal(res2.handled, true);
  assert.equal(ordersDb.size, 1, "Payment order count stays 1");
  assert.equal(ledgerEntries.length, 1, "Ledger entry count stays 1 (no double credit)");
  assert.equal(walletBalance, 15000, "Wallet balance remains 15000 cents");
}

async function testMonotonicRefundStatusTransitions() {
  const refundsDb = new Map<string, Record<string, unknown>>();
  const ledgerEntries: Record<string, unknown>[] = [];
  let walletBalance = 10000;

  const mockOrder: PaymentOrderRow = {
    id: "order_mono_1",
    tenant_id: "tenant_mono_1",
    provider: "razorpay",
    provider_order_id: null,
    provider_payment_id: "pay_mono_1",
    amount_cents: 10000,
    currency: "INR",
    state: "CAPTURED",
    payment_purpose: "wallet_topup",
    mode: "live",
    reference_type: "payment_link",
    reference_id: "pl_ref_mono",
    metadata: { link_id: "link_mono_1" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const createRefundChain = (targetId: string) => ({
    eq: (f2?: string, v2?: string) => ({
      maybeSingle: async () => {
        const match = refundsDb.get(targetId) || Array.from(refundsDb.values()).find((i) => i[f2 ?? ""] === v2);
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
  });

  const mockDb = {
    from: (table: string) => {
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockOrder, error: null }),
              single: async () => ({ data: mockOrder, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: mockOrder, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "payment_refunds") {
        return {
          select: () => ({
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
            walletBalance += entry.amount_cents as number;
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
              maybeSingle: async () => ({ data: { tenant_id: mockOrder.tenant_id, balance_cents: walletBalance }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { balance_cents: walletBalance }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const rfId = "rfnd_mono_999";
  const refundPayload = (statusEvent: string) => ({
    eventType: statusEvent,
    payload: {
      payload: {
        refund: { entity: { id: rfId, payment_id: "pay_mono_1", amount: 10000 } },
      },
    },
  });

  // 1. Processed -> PROCESSED
  const pRes = await processRazorpayWebhookEvent(mockDb, refundPayload("refund.processed"));
  assert.equal(pRes.handled, true);
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED");
  assert.equal(walletBalance, 0, "Wallet reversed by 10000");
  assert.equal(ledgerEntries.length, 1);

  // 2. Processed then Failed -> Remains PROCESSED
  const fRes = await processRazorpayWebhookEvent(mockDb, refundPayload("refund.failed"));
  assert.equal(fRes.handled, true);
  assert.equal(fRes.actionTaken, "refund_failed_ignored_already_processed");
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED", "Status must stay PROCESSED");
  assert.equal(walletBalance, 0, "Wallet balance untouched by refund.failed");

  // 3. Processed then Created -> Remains PROCESSED
  const cRes = await processRazorpayWebhookEvent(mockDb, refundPayload("refund.created"));
  assert.equal(cRes.handled, true);
  assert.equal(cRes.actionTaken, "refund_created_ignored_already_terminal");
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED", "Status must stay PROCESSED");

  // 4. Duplicate refund.processed events reverse wallet once
  const dupRes = await processRazorpayWebhookEvent(mockDb, refundPayload("refund.processed"));
  assert.equal(dupRes.handled, true);
  assert.equal(ledgerEntries.length, 1, "Duplicate refund.processed MUST NOT reverse wallet twice");
  assert.equal(walletBalance, 0);

  // 5. Failed then Created -> Remains FAILED
  const rfIdFailed = "rfnd_mono_failed_888";
  const failedPayload = (statusEvent: string) => ({
    eventType: statusEvent,
    payload: {
      payload: {
        refund: { entity: { id: rfIdFailed, payment_id: "pay_mono_1", amount: 5000 } },
      },
    },
  });

  await processRazorpayWebhookEvent(mockDb, failedPayload("refund.failed"));
  assert.equal(refundsDb.get(rfIdFailed)?.status, "FAILED");

  await processRazorpayWebhookEvent(mockDb, failedPayload("refund.created"));
  assert.equal(refundsDb.get(rfIdFailed)?.status, "FAILED", "refund.created must NOT downgrade FAILED to PENDING");
}

async function run() {
  testWebhookSignatureVerification();
  await testMultipleEventsForSamePaymentLinkSingleCredit();
  await testMonotonicRefundStatusTransitions();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
