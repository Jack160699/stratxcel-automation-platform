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
  const secret = "rotated_test_webhook_secret_123456";
  const oldSecret = "old_compromised_secret_998877";
  const rawBody = JSON.stringify({ entity: "event", account_id: "acc_112233", event: "payment_link.paid" });
  const validSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const oldSig = crypto.createHmac("sha256", oldSecret).update(rawBody, "utf8").digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, oldSig, secret), false, "Signature generated with old/fallback secret must be rejected");
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "wrong_sig_123", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, ""), false, "Missing secret must fail verification");
  assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);

  // Whitespace trimming policy check: secret.trim() matches trimmed secret
  const untrimmedSecret = "   rotated_test_webhook_secret_123456  \n";
  assert.equal(verifyRazorpayWebhookSignature(rawBody, validSig, untrimmedSecret.trim()), true);
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
      if (fn === "process_refund_atomic_v11" || fn === "process_refund_atomic_v10" || fn === "process_refund_atomic_v9" || fn === "process_refund_atomic_v8" || fn === "process_refund_atomic_v7" || fn === "process_refund_atomic_v6" || fn === "process_refund_atomic_v5" || fn === "process_refund_atomic_v4") {
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
      if (fn === "process_refund_atomic_v11" || fn === "process_refund_atomic_v10" || fn === "process_refund_atomic_v9" || fn === "process_refund_atomic_v8" || fn === "process_refund_atomic_v7" || fn === "process_refund_atomic_v6" || fn === "process_refund_atomic_v5") {
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
  assert.equal(resPending.actionTaken, "refund_v11_failed_provider_refund_not_processed");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].args.p_provider_refund_status, "pending", "Pending status passed unchanged to RPC");

  // E. Valid refund.processed invokes v11 with exact provider values
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
  assert.equal(resValid.actionTaken, "refund_processed_v11_atomic");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "process_refund_atomic_v11");
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

async function testProviderCreatedRefundReconciliation() {
  // Shared state trackers
  const refundsDb = new Map<string, Record<string, unknown>>();
  const ordersDb = new Map<string, Record<string, unknown>>();
  const ledgerEntries: Record<string, unknown>[] = [];
  let walletBalance = 50000;
  let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let orderLookupError: { message: string } | null = null;
  let insertError: { message: string } | null = null;
  let rpcError: { message: string } | null = null;

  // Seed a known payment order
  ordersDb.set("pay_provider_100", { id: "order_uuid_100", tenant_id: "tenant_uuid_100" });

  const buildMockDb = () => ({
    from: (table: string) => {
      if (table === "payment_refunds") {
        return {
          select: () => ({
            eq: (_field: string, val: string) => ({
              maybeSingle: async () => ({ data: refundsDb.get(val) ?? null, error: null }),
            }),
          }),
          upsert: (row: Record<string, unknown>, _opts?: Record<string, unknown>) => {
            if (insertError) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: insertError }),
                }),
              };
            }
            const key = row.provider_refund_id as string;
            const existing = refundsDb.get(key);
            if (!existing) {
              const newRow = { id: `refund_db_${key}`, ...row };
              refundsDb.set(key, newRow);
              return {
                select: () => ({
                  single: async () => ({ data: newRow, error: null }),
                }),
              };
            }
            // Conflict: return existing row (upsert behavior)
            return {
              select: () => ({
                single: async () => ({ data: existing, error: null }),
              }),
            };
          },
          update: (fields: Record<string, unknown>) => ({
            eq: (_f: string, id: string) => {
              const item = [...refundsDb.values()].find((r) => r.id === id);
              if (item) Object.assign(item, fields);
              return Promise.resolve({ data: item, error: null });
            },
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: (_field: string, val: string) => ({
              maybeSingle: async () => {
                if (orderLookupError) return { data: null, error: orderLookupError };
                return { data: ordersDb.get(val) ?? null, error: null };
              },
            }),
          }),
        };
      }
      return {};
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "process_refund_atomic_v11") {
        if (rpcError) return { data: null, error: rpcError };
        const refId = args.p_refund_id as string;
        const item = [...refundsDb.values()].find((r) => r.id === refId);
        if (item) {
          item.status = "PROCESSED";
        }
        walletBalance -= (args.p_actual_refund_amount_cents as number) || 0;
        ledgerEntries.push({
          id: `ledger_${Date.now()}_${Math.random()}`,
          tenant_id: "tenant_uuid_100",
          entry_type: "refund",
          amount_cents: -((args.p_actual_refund_amount_cents as number) || 0),
          reference_type: "payment_refund",
          reference_id: refId,
        });
        return { data: { success: true, status: "PROCESSED" }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as ServiceClient);

  const makeRefundPayload = (rfndId: string, payId: string, amount: number, status: string) => ({
    payload: {
      refund: { entity: { id: rfndId, payment_id: payId, amount, status } },
    },
  });

  // --- Test 1: Existing local refund row → refund_processed_v11_atomic ---
  rpcCalls = [];
  refundsDb.set("rfnd_existing_001", {
    id: "refund_db_existing_001",
    provider_refund_id: "rfnd_existing_001",
    payment_order_id: "order_uuid_100",
    amount_cents: 5000,
    status: "PENDING",
  });

  const res1 = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_001",
    payload: makeRefundPayload("rfnd_existing_001", "pay_provider_100", 5000, "processed"),
  });
  assert.equal(res1.handled, true, "Test 1: existing refund row must be handled");
  assert.equal(res1.actionTaken, "refund_processed_v11_atomic", "Test 1: must call v11 atomic");
  assert.equal(rpcCalls.length, 1, "Test 1: exactly one RPC call");
  assert.equal(rpcCalls[0].fn, "process_refund_atomic_v11");

  // --- Test 2: No existing local refund row (auto-resolve via payment order) ---
  rpcCalls = [];
  ledgerEntries.length = 0;
  walletBalance = 50000;

  const res2 = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_002",
    payload: makeRefundPayload("rfnd_autoresolve_002", "pay_provider_100", 3000, "processed"),
  });
  assert.equal(res2.handled, true, "Test 2: auto-resolved refund must be handled");
  assert.equal(res2.actionTaken, "refund_processed_v11_atomic", "Test 2: must call v11 atomic");
  assert.ok(refundsDb.has("rfnd_autoresolve_002"), "Test 2: refund row must be created");
  assert.equal(rpcCalls.length, 1, "Test 2: exactly one RPC call");
  assert.equal(rpcCalls[0].args.p_provider_refund_id, "rfnd_autoresolve_002");
  assert.equal(rpcCalls[0].args.p_actual_refund_amount_cents, 3000);

  // --- Test 3: Unknown provider payment ID → handled: false ---
  rpcCalls = [];

  const res3 = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_003",
    payload: makeRefundPayload("rfnd_unknown_003", "pay_NONEXISTENT", 1000, "processed"),
  });
  assert.equal(res3.handled, false, "Test 3: unknown payment must not be handled");
  assert.equal(res3.actionTaken, "payment_order_not_found_for_refund", "Test 3: correct action");
  assert.equal(rpcCalls.length, 0, "Test 3: no RPC called");

  // --- Test 4: Payment order lookup database error → throws ---
  rpcCalls = [];
  orderLookupError = { message: "connection timeout" };

  await assert.rejects(
    async () => {
      await processRazorpayWebhookEvent(buildMockDb(), {
        eventType: "refund.processed",
        providerEventId: "evt_test_004",
        payload: makeRefundPayload("rfnd_dberr_004", "pay_provider_100", 1000, "processed"),
      });
    },
    /payment_order lookup failed for refund: connection timeout/,
    "Test 4: payment order lookup error must throw"
  );
  assert.equal(rpcCalls.length, 0, "Test 4: no RPC called on DB error");
  orderLookupError = null;

  // --- Test 5: Refund row insertion database error → throws ---
  rpcCalls = [];
  insertError = { message: "disk full" };

  await assert.rejects(
    async () => {
      await processRazorpayWebhookEvent(buildMockDb(), {
        eventType: "refund.processed",
        providerEventId: "evt_test_005",
        payload: makeRefundPayload("rfnd_inserterr_005", "pay_provider_100", 1000, "processed"),
      });
    },
    /refund row creation failed: disk full/,
    "Test 5: refund insert error must throw"
  );
  assert.equal(rpcCalls.length, 0, "Test 5: no RPC called on insert error");
  insertError = null;

  // --- Test 6: Duplicate sequential refund webhook → already_processed ---
  rpcCalls = [];
  ledgerEntries.length = 0;
  walletBalance = 50000;

  // First call processes
  const res6a = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_006a",
    payload: makeRefundPayload("rfnd_dup_006", "pay_provider_100", 2000, "processed"),
  });
  assert.equal(res6a.handled, true, "Test 6a: first call must succeed");
  assert.equal(res6a.actionTaken, "refund_processed_v11_atomic");

  // Second call is idempotent
  rpcCalls = [];
  const res6b = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_006b",
    payload: makeRefundPayload("rfnd_dup_006", "pay_provider_100", 2000, "processed"),
  });
  assert.equal(res6b.handled, true, "Test 6b: duplicate must be handled");
  assert.equal(res6b.actionTaken, "refund_already_processed_idempotent", "Test 6b: idempotent");
  assert.equal(rpcCalls.length, 0, "Test 6b: no RPC called for already processed");

  // --- Test 7: Two concurrent identical refund webhooks → upsert handles conflict ---
  // (Simulated: upsert returns existing row on conflict, so second call sees PROCESSED)
  rpcCalls = [];
  ledgerEntries.length = 0;
  walletBalance = 50000;
  refundsDb.delete("rfnd_concurrent_007");

  // First processes
  const res7a = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_007a",
    payload: makeRefundPayload("rfnd_concurrent_007", "pay_provider_100", 4000, "processed"),
  });
  assert.equal(res7a.handled, true, "Test 7a: first concurrent call succeeds");

  // Second sees PROCESSED status via upsert conflict resolution
  rpcCalls = [];
  const res7b = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_007b",
    payload: makeRefundPayload("rfnd_concurrent_007", "pay_provider_100", 4000, "processed"),
  });
  assert.equal(res7b.handled, true, "Test 7b: second concurrent call handled");
  assert.equal(res7b.actionTaken, "refund_already_processed_idempotent", "Test 7b: idempotent");

  // --- Test 8: Exactly one payment_refunds row ---
  const refund007Rows = [...refundsDb.values()].filter(
    (r) => r.provider_refund_id === "rfnd_concurrent_007"
  );
  assert.equal(refund007Rows.length, 1, "Test 8: exactly one refund row");

  // --- Test 9: Exactly one negative wallet ledger entry ---
  const negativeLedger = ledgerEntries.filter(
    (e) => (e as any).entry_type === "refund" && (e as any).reference_id === "refund_db_rfnd_concurrent_007"
  );
  assert.equal(negativeLedger.length, 1, "Test 9: exactly one negative ledger entry");
  assert.equal((negativeLedger[0] as any).amount_cents, -4000, "Test 9: correct refund amount");

  // --- Test 10: Exactly one wallet balance reduction ---
  assert.equal(walletBalance, 46000, "Test 10: wallet reduced by exactly 4000");

  // --- Test 11: Missing provider refund evidence fails closed ---
  rpcCalls = [];
  const res11 = await processRazorpayWebhookEvent(buildMockDb(), {
    eventType: "refund.processed",
    providerEventId: "evt_test_011",
    payload: { payload: { refund: { entity: { id: "rfnd_noevidence_011", payment_id: "pay_provider_100" } } } },
  });
  assert.equal(res11.handled, false, "Test 11: missing evidence must not be handled");
  assert.equal(res11.actionTaken, "missing_refund_provider_evidence", "Test 11: correct action");
  assert.equal(rpcCalls.length, 0, "Test 11: no RPC called");

  // --- Test 12: RPC failure leaves webhook retryable (throws) ---
  rpcCalls = [];
  rpcError = { message: "RPC timeout" };
  refundsDb.delete("rfnd_rpcfail_012");

  await assert.rejects(
    async () => {
      await processRazorpayWebhookEvent(buildMockDb(), {
        eventType: "refund.processed",
        providerEventId: "evt_test_012",
        payload: makeRefundPayload("rfnd_rpcfail_012", "pay_provider_100", 1000, "processed"),
      });
    },
    /process_refund_atomic_v11 RPC failed: RPC timeout/,
    "Test 12: RPC failure must throw for retry"
  );
  rpcError = null;
}

async function run() {
  testWebhookSignatureVerification();
  await testMultipleEventsForSamePaymentLinkSingleCredit();
  await testMonotonicRefundStatusTransitions();
  await testRefundWebhookProviderEvidenceValidation();
  await testWebhookClaimAndCompletionContract();
  await testProviderCreatedRefundReconciliation();
  console.log("razorpay-webhook-events.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
