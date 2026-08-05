// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/razorpay-rpc-paths.test.ts
import assert from "node:assert/strict";
import type { ServiceClient } from "../db.ts";
import { appendLedgerEntryAtomic } from "../wallet/ledger.ts";
import {
  claimRazorpayWebhookEvent,
  markWebhookEventProcessed,
  processRazorpayWebhookEvent,
  DuplicateWebhookEventError,
  WebhookEventInProgressError,
} from "../razorpay/webhook-events.ts";

// 1. RPC Tests for appendLedgerEntryAtomic
async function testAppendLedgerEntryAtomicRpcPaths() {
  let fromCalled = false;

  // Test 1: RPC succeeds with inserted = true
  const mockRpcSuccessInserted = {
    rpc: async (_fn: string, _args: Record<string, unknown>) => {
      return { data: { inserted: true, entry_id: "entry_111", balance_cents: 5000 }, error: null };
    },
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  const res1 = await appendLedgerEntryAtomic(mockRpcSuccessInserted, {
    tenantId: "tenant_1",
    entryType: "credit_purchase",
    amountCents: 5000,
    referenceType: "payment_order",
    referenceId: "order_1",
  });
  assert.equal(res1.settled, true);
  assert.equal(res1.entryId, "entry_111");
  assert.equal(fromCalled, false, "Must not call from() on RPC success");

  // Test 2: RPC succeeds with inserted = false (idempotent duplicate)
  const mockRpcSuccessDuplicate = {
    rpc: async () => ({ data: { inserted: false, entry_id: "entry_111", balance_cents: 5000 }, error: null }),
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  const res2 = await appendLedgerEntryAtomic(mockRpcSuccessDuplicate, {
    tenantId: "tenant_1",
    entryType: "credit_purchase",
    amountCents: 5000,
    referenceType: "payment_order",
    referenceId: "order_1",
  });
  assert.equal(res2.settled, false);
  assert.equal(fromCalled, false, "Must not call from() on RPC duplicate");

  // Test 3: RPC returns an error -> throws and NEVER calls from()
  fromCalled = false;
  const mockRpcError = {
    rpc: async () => ({ data: null, error: { message: "Internal Postgres Error" } }),
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  await assert.rejects(
    () =>
      appendLedgerEntryAtomic(mockRpcError, {
        tenantId: "tenant_1",
        entryType: "credit_purchase",
        amountCents: 5000,
      }),
    (err: Error) => err.message.includes("Atomic wallet ledger RPC execution failed")
  );
  assert.equal(fromCalled, false, "Must FAIL CLOSED and NEVER fall back to from() after RPC error");

  // Test 4: RPC returns malformed/null data -> throws and NEVER calls from()
  fromCalled = false;
  const mockRpcMalformed = {
    rpc: async () => ({ data: null, error: null }),
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  await assert.rejects(
    () =>
      appendLedgerEntryAtomic(mockRpcMalformed, {
        tenantId: "tenant_1",
        entryType: "credit_purchase",
        amountCents: 5000,
      }),
    (err: Error) => err.message.includes("returned invalid or malformed response")
  );
  assert.equal(fromCalled, false, "Must FAIL CLOSED and NEVER fall back to from() after malformed RPC response");
}

// 2. RPC Tests for claimRazorpayWebhookEvent
async function testClaimRazorpayWebhookEventRpcPaths() {
  let fromCalled = false;

  // Test 1: RPC claim succeeded with valid token
  const mockClaimSuccess = {
    rpc: async () => ({
      data: { claimed: true, status: "claimed_new", event_id: "evt_row_1", token: "tok_secret_123" },
      error: null,
    }),
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  const claimRes = await claimRazorpayWebhookEvent(mockClaimSuccess, {
    providerEventId: "evt_100",
    eventType: "payment_link.paid",
    payload: {},
  });
  assert.equal(claimRes.claimed, true);
  assert.equal(claimRes.token, "tok_secret_123");
  assert.equal(fromCalled, false, "Must not call from() when RPC succeeds");

  // Test 2: RPC returns status = already_processed -> throws DuplicateWebhookEventError
  const mockClaimDuplicate = {
    rpc: async () => ({
      data: { claimed: false, status: "already_processed", event_id: "evt_row_1" },
      error: null,
    }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockClaimDuplicate, { providerEventId: "evt_100", eventType: "payment_link.paid", payload: {} }),
    DuplicateWebhookEventError
  );

  // Test 3: RPC returns status = in_progress -> throws WebhookEventInProgressError
  const mockClaimInProgress = {
    rpc: async () => ({
      data: { claimed: false, status: "in_progress", event_id: "evt_row_1" },
      error: null,
    }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockClaimInProgress, { providerEventId: "evt_100", eventType: "payment_link.paid", payload: {} }),
    WebhookEventInProgressError
  );

  // Test 4: RPC error -> throws and NEVER calls from()
  fromCalled = false;
  const mockClaimError = {
    rpc: async () => ({ data: null, error: { message: "Database failure" } }),
    from: () => {
      fromCalled = true;
      return {};
    },
  } as unknown as ServiceClient;

  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockClaimError, { providerEventId: "evt_100", eventType: "payment_link.paid", payload: {} }),
    (err: Error) => err.message.includes("Webhook claim RPC failed execution")
  );
  assert.equal(fromCalled, false, "Must FAIL CLOSED and NEVER fall back to from() when RPC throws error");

  // Test 5: RPC returns claimed = true WITHOUT a token -> rejected (throws)
  const mockClaimMissingToken = {
    rpc: async () => ({
      data: { claimed: true, status: "claimed_new", event_id: "evt_row_1", token: "" },
      error: null,
    }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => claimRazorpayWebhookEvent(mockClaimMissingToken, { providerEventId: "evt_100", eventType: "payment_link.paid", payload: {} }),
    (err: Error) => err.message.includes("without a valid processing token")
  );
}

// 3. RPC Tests for markWebhookEventProcessed
async function testMarkWebhookEventProcessedRpcPaths() {
  // Test 1: Valid token completion succeeds
  const mockCompleteSuccess = {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      if (args.p_token === "valid_token_123") {
        return { data: true, error: null };
      }
      return { data: false, error: null };
    },
  } as unknown as ServiceClient;

  await markWebhookEventProcessed(mockCompleteSuccess, "evt_id_1", "valid_token_123");

  // Test 2: Incorrect token returns false -> wrapper throws
  await assert.rejects(
    () => markWebhookEventProcessed(mockCompleteSuccess, "evt_id_1", "wrong_token"),
    (err: Error) => err.message.includes("returned false: token mismatch or already completed")
  );

  // Test 3: RPC error throws
  const mockCompleteError = {
    rpc: async () => ({ data: null, error: { message: "Permission denied" } }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => markWebhookEventProcessed(mockCompleteError, "evt_id_1", "valid_token_123"),
    (err: Error) => err.message.includes("Webhook completion RPC error")
  );

  // Test 4: Missing/blank token throws
  await assert.rejects(
    () => markWebhookEventProcessed(mockCompleteSuccess, "evt_id_1", ""),
    (err: Error) => err.message.includes("Processing token is required")
  );
}

// 4. DB failure checking in payment_link.paid handler
async function testPaymentLinkPaidDbFailures() {
  const basePayload = {
    eventType: "payment_link.paid",
    payload: {
      payload: {
        payment_link: { entity: { id: "plink_test_100", reference_id: "pl_ref_100", amount: 5000, currency: "INR", status: "paid" } },
        payment: { entity: { id: "pay_test_100", amount: 5000, currency: "INR", status: "captured" } },
      },
    },
  };

  // Stage 1: payment_links lookup error -> throws
  const mockDbLinkQueryFail = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "Link DB error" } }),
        }),
      }),
    }),
  } as unknown as ServiceClient;

  await assert.rejects(
    () => processRazorpayWebhookEvent(mockDbLinkQueryFail, basePayload),
    (err: Error) => err.message.includes("payment_link.paid: lookup failed")
  );

  // Stage 2: payment_links status update error -> throws
  const mockDbLinkUpdateFail = {
    from: (table: string) => {
      if (table === "payment_links") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "link_1", tenant_id: "t1", amount_cents: 5000, currency: "INR", status: "created", payment_purpose: "wallet_topup", mode: "live", reference_id: "pl_ref_100" },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: "Update link status failed" } }),
          }),
        };
      }
      if (table === "payment_reconciliation_issues") {
        return { insert: async () => ({ error: null }) };
      }
      return {};
    },
  } as unknown as ServiceClient;

  await assert.rejects(
    () => processRazorpayWebhookEvent(mockDbLinkUpdateFail, basePayload),
    (err: Error) => err.message.includes("payment_link.paid: update link status failed")
  );

  // Stage 3: payment_orders insert error (non-23505) -> throws
  const mockDbOrderInsertFail = {
    from: (table: string) => {
      if (table === "payment_links") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "link_1", tenant_id: "t1", amount_cents: 5000, currency: "INR", status: "paid", payment_purpose: "wallet_topup", mode: "live", reference_id: "pl_ref_100" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { code: "50000", message: "Insert order failed" } }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  await assert.rejects(
    () => processRazorpayWebhookEvent(mockDbOrderInsertFail, basePayload),
    (err: Error) => err.message.includes("payment_link.paid: insert payment order failed")
  );

  // Stage 4: payment_orders insert 23505 race condition -> re-fetches and settles successfully
  let refetchedOrder = false;
  const mockDbOrderRaceSuccess = {
    rpc: async () => ({ data: { inserted: true, entry_id: "e1", balance_cents: 5000 }, error: null }),
    from: (table: string) => {
      if (table === "payment_links") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "link_1", tenant_id: "t1", amount_cents: 5000, currency: "INR", status: "paid", payment_purpose: "wallet_topup", mode: "live", reference_id: "pl_ref_100" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                    single: async () => {
                      refetchedOrder = true;
                      return {
                        data: { id: "order_race_1", tenant_id: "t1", amount_cents: 5000, currency: "INR", state: "CAPTURED", mode: "live", provider: "razorpay" },
                        error: null,
                      };
                    },
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { code: "23505", message: "Unique constraint collision" } }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const raceRes = await processRazorpayWebhookEvent(mockDbOrderRaceSuccess, basePayload);
  assert.equal(raceRes.handled, true);
  assert.equal(raceRes.actionTaken, "payment_link_paid_and_settled");
  assert.equal(refetchedOrder, true, "Uniqueness race must re-fetch existing order and settle idempotently");
}

// 5. Tests for Unreconciled Handled=False Webhook Behaviors
async function testUnhandledEventsRetryBehavior() {
  // Test missing local payment link returns handled=false
  const mockDbNoLink = {
    from: (table: string) => {
      if (table === "payment_reconciliation_issues") {
        return { insert: async () => ({ error: null }) };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  } as unknown as ServiceClient;

  const res1 = await processRazorpayWebhookEvent(mockDbNoLink, {
    eventType: "payment_link.paid",
    payload: { payload: { payment_link: { entity: { id: "plink_missing_999", amount: 1000, currency: "INR", status: "paid" } }, payment: { entity: { id: "pay_999", amount: 1000, currency: "INR", status: "captured" } } } },
  });
  assert.equal(res1.handled, false, "Missing local payment link must return handled=false");
  assert.equal(res1.actionTaken, "payment_link_not_found");

  // Test refund missing payment order returns handled=false
  const mockDbNoOrderRefund = {
    from: (table: string) => {
      if (table === "payment_refunds") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "payment_orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as ServiceClient;

  const res2 = await processRazorpayWebhookEvent(mockDbNoOrderRefund, {
    eventType: "refund.processed",
    payload: { payload: { refund: { entity: { id: "rfnd_missing_999", payment_id: "pay_missing_999", amount: 5000 } } } },
  });
  assert.equal(res2.handled, false, "Missing payment order for refund must return handled=false");
  assert.equal(res2.actionTaken, "payment_order_not_found_for_refund");
}

async function run() {
  await testAppendLedgerEntryAtomicRpcPaths();
  await testClaimRazorpayWebhookEventRpcPaths();
  await testMarkWebhookEventProcessedRpcPaths();
  await testPaymentLinkPaidDbFailures();
  await testUnhandledEventsRetryBehavior();
  console.log("razorpay-rpc-paths.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
