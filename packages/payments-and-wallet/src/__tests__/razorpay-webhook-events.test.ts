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
      if (table === "payment_reconciliation_issues") {
        return { insert: async () => ({ error: null }) };
      }
      return {};
    },
    rpc: async (fn: string) => {
      if (fn === "reconcile_and_fulfill_razorpay_payment_v4") {
        if (!ordersDb.has("order_biz_1")) {
          ordersDb.set("order_biz_1", { id: "order_biz_1", amount_cents: 15000 });
          ledgerEntries.push({ id: "entry_1", amount_cents: 15000 });
          walletBalance += 15000;
          return { data: { fulfilled: true, already_fulfilled: false, purpose: "wallet_topup" }, error: null };
        }
        return { data: { fulfilled: true, already_fulfilled: true, purpose: "wallet_topup" }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as ServiceClient;

  const eventPayload = {
    payload: {
      payment_link: { entity: { id: "plink_live_biz_1", reference_id: "pl_ref_biz_100", amount: 15000, currency: "INR", status: "paid" } },
      payment: { entity: { id: "pay_live_biz_1", amount: 15000, currency: "INR", status: "captured" } },
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
      if (table === "payment_reconciliation_issues") {
        return { insert: async () => ({ error: null }) };
      }
      return {};
    },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "process_refund_atomic_v5" || fn === "process_refund_atomic_v4") {
        const refId = (args?.p_refund_id as string) || "rfnd_mono_999";
        const item = refundsDb.get(refId) || refundsDb.get("rfnd_mono_999") || { id: "rfnd_mono_999", status: "PENDING" };
        item.status = "PROCESSED";
        refundsDb.set("rfnd_mono_999", item);
        refundsDb.set(refId, item);
        walletBalance = 0;
        if (!ledgerEntries.find((e) => e.reference_id === refId)) {
          ledgerEntries.push({ id: `entry_${Date.now()}`, tenant_id: "tenant_mono_1", reference_type: "payment_refund", reference_id: refId });
        }
        return { data: { success: true, status: "PROCESSED" }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as ServiceClient;

  const rfId = "rfnd_mono_999";
  refundsDb.set(rfId, { id: rfId, provider_refund_id: rfId, payment_order_id: "order_mono_1", amount_cents: 10000, status: "PENDING" });

  const refundPayload = (statusEvent: string) => ({
    eventType: statusEvent,
    payload: {
      payload: {
        refund: { entity: { id: rfId, payment_id: "pay_mono_1", amount: 10000, status: "processed" } },
      },
    },
  });

  // 1. Processed -> PROCESSED
  const pRes = await processRazorpayWebhookEvent(mockDb, { ...refundPayload("refund.processed"), providerEventId: "evt_hdr_mono_1" });
  assert.equal(pRes.handled, true);
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED");
  assert.equal(walletBalance, 0, "Wallet reversed by 10000");
  assert.equal(ledgerEntries.length, 1);

  // 2. Processed then Failed -> Remains PROCESSED
  const fRes = await processRazorpayWebhookEvent(mockDb, { ...refundPayload("refund.failed"), providerEventId: "evt_hdr_mono_2" });
  assert.equal(fRes.handled, true);
  assert.equal(fRes.actionTaken, "refund_already_processed_idempotent");
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED", "Status must stay PROCESSED");
  assert.equal(walletBalance, 0, "Wallet balance untouched by refund.failed");

  // 3. Processed then Created -> Remains PROCESSED
  const cRes = await processRazorpayWebhookEvent(mockDb, { ...refundPayload("refund.created"), providerEventId: "evt_hdr_mono_3" });
  assert.equal(cRes.handled, true);
  assert.equal(cRes.actionTaken, "refund_already_processed_idempotent");
  assert.equal(refundsDb.get(rfId)?.status, "PROCESSED", "Status must stay PROCESSED");

  // 4. Duplicate refund.processed events reverse wallet once
  const dupRes = await processRazorpayWebhookEvent(mockDb, { ...refundPayload("refund.processed"), providerEventId: "evt_hdr_mono_4" });
  assert.equal(dupRes.handled, true);
  assert.equal(ledgerEntries.length, 1, "Duplicate refund.processed MUST NOT reverse wallet twice");
  assert.equal(walletBalance, 0);

  // 5. Failed then Created -> Remains FAILED
  const rfIdFailed = "rfnd_mono_failed_888";
  refundsDb.set(rfIdFailed, { id: rfIdFailed, provider_refund_id: rfIdFailed, payment_order_id: "order_mono_1", amount_cents: 5000, status: "PENDING" });

  const failedPayload = (statusEvent: string) => ({
    eventType: statusEvent,
    payload: {
      payload: {
        refund: { entity: { id: rfIdFailed, payment_id: "pay_mono_1", amount: 5000, status: "processed" } },
      },
    },
    providerEventId: "evt_hdr_mono_5",
  });

  await processRazorpayWebhookEvent(mockDb, failedPayload("refund.failed"));
  assert.equal(refundsDb.get(rfIdFailed)?.status, "FAILED");

  await processRazorpayWebhookEvent(mockDb, failedPayload("refund.created"));
  assert.equal(refundsDb.get(rfIdFailed)?.status, "FAILED", "refund.created must NOT downgrade FAILED to PENDING");
}

async function testRefundWebhookProviderEvidenceValidation() {
  const refundsDb = new Map<string, Record<string, unknown>>();
  let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  const mockRefundRecord = {
    id: "ref_db_uuid_100",
    payment_order_id: "order_db_uuid_100",
    provider_refund_id: "rfnd_prov_100",
    amount_cents: 10000, // existing record amount is 10000
    status: "PENDING",
  };
  refundsDb.set("rfnd_prov_100", mockRefundRecord);

  const mockDb = {
    from: (table: string) => {
      if (table === "payment_refunds") {
        return {
          select: () => ({
            eq: (_field: string, val: string) => ({
              maybeSingle: async () => ({ data: refundsDb.get(val) ?? null, error: null }),
            }),
          }),
        };
      }
      return {};
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "process_refund_atomic_v5") {
        const pStatus = args?.p_provider_refund_status;
        if (pStatus !== "processed") {
          return { data: { success: false, reason: "provider_refund_not_processed" }, error: null };
        }
        return { data: { success: true, status: "PROCESSED" }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as ServiceClient;

  // A. Missing refund status -> invokes no RPC, actionTaken = missing_refund_provider_evidence
  rpcCalls = [];
  const resNoStatus = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    providerEventId: "evt_hdr_101",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_prov_100", payment_id: "pay_100", amount: 10000 /* status missing */ } },
      },
    },
  });
  assert.equal(resNoStatus.handled, false);
  assert.equal(resNoStatus.actionTaken, "missing_refund_provider_evidence");
  assert.equal(rpcCalls.length, 0, "Missing status MUST invoke no RPC");

  // B. Missing refund amount -> invokes no RPC, actionTaken = missing_refund_provider_evidence
  rpcCalls = [];
  const resNoAmount = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    providerEventId: "evt_hdr_102",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_prov_100", payment_id: "pay_100", status: "processed" /* amount missing */ } },
      },
    },
  });
  assert.equal(resNoAmount.handled, false);
  assert.equal(resNoAmount.actionTaken, "missing_refund_provider_evidence");
  assert.equal(rpcCalls.length, 0, "Missing amount MUST invoke no RPC and MUST NOT fallback to existingRefund.amount_cents");

  // C. Missing header provider event ID -> invokes no RPC, actionTaken = missing_refund_provider_evidence
  rpcCalls = [];
  const resNoEvtId = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    /* providerEventId missing */
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_prov_100", payment_id: "pay_100", amount: 10000, status: "processed" } },
      },
    },
  });
  assert.equal(resNoEvtId.handled, false);
  assert.equal(resNoEvtId.actionTaken, "missing_refund_provider_evidence");
  assert.equal(rpcCalls.length, 0, "Missing providerEventId MUST invoke no RPC");

  // D. Pending status passed unchanged -> RPC receives "pending" and fails with provider_refund_not_processed
  rpcCalls = [];
  const resPending = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    providerEventId: "evt_hdr_104",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_prov_100", payment_id: "pay_100", amount: 10000, status: "pending" } },
      },
    },
  });
  assert.equal(resPending.handled, false);
  assert.equal(resPending.actionTaken, "refund_v5_failed_provider_refund_not_processed");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].args.p_provider_refund_status, "pending", "Pending status passed unchanged to RPC");

  // E. Valid refund.processed invokes v5 with exact provider values
  rpcCalls = [];
  const resValid = await processRazorpayWebhookEvent(mockDb, {
    eventType: "refund.processed",
    providerEventId: "evt_hdr_105_exact",
    payload: {
      payload: {
        refund: { entity: { id: "rfnd_prov_100", payment_id: "pay_100_exact", amount: 7500, status: "processed" } },
      },
    },
  });
  assert.equal(resValid.handled, true);
  assert.equal(resValid.actionTaken, "refund_processed_v5_atomic");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "process_refund_atomic_v5");
  assert.equal(rpcCalls[0].args.p_refund_id, "ref_db_uuid_100");
  assert.equal(rpcCalls[0].args.p_payment_order_id, "order_db_uuid_100");
  assert.equal(rpcCalls[0].args.p_provider_refund_id, "rfnd_prov_100");
  assert.equal(rpcCalls[0].args.p_provider_payment_id, "pay_100_exact");
  assert.equal(rpcCalls[0].args.p_actual_refund_amount_cents, 7500, "Exact provider amount 7500 passed (not fallback 10000)");
  assert.equal(rpcCalls[0].args.p_provider_refund_status, "processed");
  assert.equal(rpcCalls[0].args.p_provider_event_id, "evt_hdr_105_exact");
}

async function testWebhookClaimAndCompletionContract() {
  let capturedRpcArgs: { fn: string; args?: Record<string, unknown> }[] = [];

  const mockDb = (rpcHandler: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) =>
    ({
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        capturedRpcArgs.push({ fn, args });
        return rpcHandler(fn, args);
      },
    } as unknown as ServiceClient);

  // 1. New claim
  capturedRpcArgs = [];
  const db1 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { claimed: true, status: "claimed_new", event_id: "db_uuid_101", token: "tok_db_101" }, error: null };
    }
    return { data: null, error: null };
  });

  const claim1 = await claimRazorpayWebhookEvent(db1, { eventId: "pay_evt_1", eventType: "payment_link.paid", payload: {} });
  assert.equal(claim1.eventId, "db_uuid_101");
  assert.equal(claim1.claimId, "db_uuid_101");
  assert.equal(claim1.token, "tok_db_101");
  assert.equal(capturedRpcArgs[0].args?.p_provider_event_id, "pay_evt_1");
  assert.equal(capturedRpcArgs[0].args?.p_event_type, "payment_link.paid");
  assert.equal(capturedRpcArgs[0].args?.p_claim_duration_seconds, 60);
  assert.equal("p_ttl_seconds" in (capturedRpcArgs[0].args || {}), false, "Do not send p_ttl_seconds");

  // 2. Retry claim
  capturedRpcArgs = [];
  const db2 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { claimed: true, status: "claimed_retry", event_id: "db_uuid_102", token: "tok_db_102" }, error: null };
    }
    return { data: null, error: null };
  });
  const claim2 = await claimRazorpayWebhookEvent(db2, { eventId: "pay_evt_2", eventType: "payment_link.paid", payload: {} });
  assert.equal(claim2.eventId, "db_uuid_102");
  assert.equal(claim2.token, "tok_db_102");

  // 3. Already processed
  const db3 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { claimed: false, status: "already_processed", event_id: "db_uuid_103" }, error: null };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await claimRazorpayWebhookEvent(db3, { eventId: "pay_evt_3", eventType: "payment_link.paid", payload: {} });
    },
    (err: unknown) => err instanceof DuplicateWebhookEventError
  );

  // 4. Currently in progress
  const db4 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { claimed: false, status: "in_progress", event_id: "db_uuid_104" }, error: null };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await claimRazorpayWebhookEvent(db4, { eventId: "pay_evt_4", eventType: "payment_link.paid", payload: {} });
    },
    (err: unknown) => err instanceof WebhookEventInProgressError
  );

  // 5. Malformed claim response
  const db5 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { status: "unknown_status" }, error: null };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await claimRazorpayWebhookEvent(db5, { eventId: "pay_evt_5", eventType: "payment_link.paid", payload: {} });
    },
    /Unexpected or malformed claim response status/
  );

  // 6. Claim RPC database error
  const db6 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: null, error: { message: "DB timeout" } };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await claimRazorpayWebhookEvent(db6, { eventId: "pay_evt_6", eventType: "payment_link.paid", payload: {} });
    },
    /claimRazorpayWebhookEvent RPC: DB timeout/
  );

  // 7. Successful completion & verifying parameters
  capturedRpcArgs = [];
  const db7 = mockDb(async (fn) => {
    if (fn === "complete_razorpay_webhook_event") {
      return { data: true, error: null };
    }
    return { data: null, error: null };
  });
  await markWebhookEventProcessed(db7, "db_uuid_707", "tok_db_707");
  assert.equal(capturedRpcArgs[0].fn, "complete_razorpay_webhook_event");
  assert.equal(capturedRpcArgs[0].args?.p_event_id, "db_uuid_707");
  assert.equal(capturedRpcArgs[0].args?.p_token, "tok_db_707");
  assert.equal("p_claim_id" in (capturedRpcArgs[0].args || {}), false, "Do not send p_claim_id");

  // 8. Completion RPC error
  const db8 = mockDb(async (fn) => {
    if (fn === "complete_razorpay_webhook_event") {
      return { data: null, error: { message: "Permission denied" } };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await markWebhookEventProcessed(db8, "db_uuid_808", "tok_db_808");
    },
    /complete_razorpay_webhook_event RPC: Permission denied/
  );

  // 9. Completion returns false
  const db9 = mockDb(async (fn) => {
    if (fn === "complete_razorpay_webhook_event") {
      return { data: false, error: null };
    }
    return { data: null, error: null };
  });
  await assert.rejects(
    async () => {
      await markWebhookEventProcessed(db9, "db_uuid_909", "tok_db_909");
    },
    /complete_razorpay_webhook_event returned non-true value: false/
  );

  // 10 & 11. Database token & event ID returned by SQL are passed unchanged
  capturedRpcArgs = [];
  const db10 = mockDb(async (fn) => {
    if (fn === "claim_razorpay_webhook_event") {
      return { data: { claimed: true, status: "claimed_new", event_id: "db_uuid_exact_spec", token: "tok_exact_spec_555" }, error: null };
    }
    if (fn === "complete_razorpay_webhook_event") {
      return { data: true, error: null };
    }
    return { data: null, error: null };
  });

  const claim10 = await claimRazorpayWebhookEvent(db10, { eventId: "pay_evt_10", eventType: "payment_link.paid", payload: {} });
  assert.equal(claim10.eventId, "db_uuid_exact_spec");
  assert.equal(claim10.token, "tok_exact_spec_555");

  await markWebhookEventProcessed(db10, claim10.eventId, claim10.token);
  assert.equal(capturedRpcArgs[1].args?.p_event_id, "db_uuid_exact_spec", "Event ID returned by SQL is used unchanged");
  assert.equal(capturedRpcArgs[1].args?.p_token, "tok_exact_spec_555", "Database token is used unchanged");
}

async function run() {
  testWebhookSignatureVerification();
  await testMultipleEventsForSamePaymentLinkSingleCredit();
  await testMonotonicRefundStatusTransitions();
  await testRefundWebhookProviderEvidenceValidation();
  await testWebhookClaimAndCompletionContract();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
