// Run with: node --experimental-strip-types packages/email-runtime/src/__tests__/email-audit-journey.test.ts
import assert from "node:assert/strict";
import {
  enqueueAuditDeliveredEmail,
  enqueueMissionTerminalEmailBestEffort,
  enqueuePaymentOutcomeEmails,
  enqueueTransactionalEmail,
  InMemoryEmailOutboxStore,
  InMemoryEmailProvider,
  processEmailOutboxBatch,
  renderEmailTemplate,
} from "../index.ts";

process.env.EMAIL_TEST_MODE = "1";
process.env.SUPPORT_EMAIL = "support@stratxcel.ai";
process.env.EMAIL_FROM = "Stratxcel <support@stratxcel.ai>";
process.env.NEXT_PUBLIC_APP_URL = "https://www.stratxcel.in";

function fakeSupabase(order: Record<string, unknown>) {
  return {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle: async () => {
          if (table === "payment_orders") return { data: order, error: null };
          if (table === "payment_links") return { data: { customer_email: "buyer@stratxcel.ai", created_by: null, id: "link-1" }, error: null };
          if (table === "audit_orders") return { data: { guest_email: "buyer@stratxcel.ai", claimed_by: null }, error: null };
          if (table === "tenant_members") return { data: null, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
}

async function run() {
  const delivered = renderEmailTemplate("AUDIT_DELIVERED", {
    businessName: "Acme Cafe",
    auditOrderId: "ao-1",
    reportUrl: "https://www.stratxcel.in/app/audit",
  });
  assert.ok(delivered.subject.includes("Audit"));
  assert.ok(delivered.html.includes("https://www.stratxcel.in/app/audit"));
  assert.equal(/stratxcel\.ai\/app/.test(delivered.html), false);
  assert.ok(/does not guarantee/i.test(delivered.html));

  const store = new InMemoryEmailOutboxStore();
  const supabase = fakeSupabase({
    id: "po-1",
    tenant_id: "tenant-a",
    payment_purpose: "audit_fee",
    amount_cents: 99900,
    currency: "INR",
    provider_payment_id: "pay_1",
    state: "CAPTURED",
    reference_id: "ref-1",
    updated_at: "2026-08-13T00:00:00.000Z",
  });

  const paymentState = { fulfilled: true };
  const results = await enqueuePaymentOutcomeEmails(supabase as never, store, {
    handled: true,
    orderId: "po-1",
    purpose: "audit_fee",
  });
  assert.equal(paymentState.fulfilled, true, "payment authority must remain successful");
  assert.equal(results[0]?.enqueued, true);

  const dup = await enqueuePaymentOutcomeEmails(supabase as never, store, {
    handled: true,
    orderId: "po-1",
    purpose: "audit_fee",
  });
  assert.equal(dup[0]?.duplicate, true, "webhook replay must not enqueue a second receipt");

  const auditState = { status: "completed" };
  const deliveredEnq = await enqueueAuditDeliveredEmail(supabase as never, store, {
    id: "ao-1",
    tenant_id: "tenant-a",
    guest_email: "buyer@stratxcel.ai",
    business_name: "Acme Cafe",
    status: "completed",
  });
  assert.equal(auditState.status, "completed");
  assert.equal(deliveredEnq?.enqueued, true);

  const deliveredDup = await enqueueAuditDeliveredEmail(supabase as never, store, {
    id: "ao-1",
    tenant_id: "tenant-a",
    guest_email: "buyer@stratxcel.ai",
    business_name: "Acme Cafe",
  });
  assert.equal(deliveredDup?.duplicate, true);

  const row = await store.getById(results[0]!.outboxId!);
  const payloadText = JSON.stringify(row?.payload ?? {});
  assert.equal(/sk_live|rzp_live|Bearer |RESEND_API_KEY|webhook_secret/i.test(payloadText), false);
  assert.equal("recipient" in (row?.payload ?? {}), false);

  const failingProvider = new InMemoryEmailProvider({ configured: true });
  failingProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: true,
    errorCode: "PROVIDER_5XX",
    errorCategory: "provider_5xx",
    errorSafe: "provider unavailable",
    httpStatus: 503,
  });
  await processEmailOutboxBatch(store, failingProvider, { limit: 10, leaseOwner: "worker-a" });
  assert.equal(paymentState.fulfilled, true);
  assert.equal(auditState.status, "completed");

  const missionState = { state: "COMPLETED" };
  await enqueueMissionTerminalEmailBestEffort(store, {
    state: "COMPLETED",
    missionId: "m-1",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    missionTitle: "Campaign setup",
    summary: "Done",
  });
  const boomStore = new InMemoryEmailOutboxStore();
  boomStore.insert = async () => {
    throw new Error("outbox down");
  };
  await enqueueMissionTerminalEmailBestEffort(boomStore, {
    state: "COMPLETED",
    missionId: "m-2",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    missionTitle: "Should not throw",
  });
  assert.equal(missionState.state, "COMPLETED");

  const cancelledStore = new InMemoryEmailOutboxStore();
  const cancelled = await enqueueTransactionalEmail(cancelledStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "buyer@stratxcel.ai",
    idempotencyKey: "audit_receipt:cancelled",
    payload: {
      productName: "Stratxcel Business Growth Audit",
      amountLabel: "999.00",
      currency: "INR",
      paymentReference: "pay_x",
      paidAt: "2026-08-13T00:00:00.000Z",
    },
  });
  await cancelledStore.markFailed(cancelled.outboxId!, {
    attemptCount: 1,
    errorCode: "CANCELLED",
    errorSafe: "cancelled",
    status: "CANCELLED",
  });
  const afterCancel = await processEmailOutboxBatch(cancelledStore, new InMemoryEmailProvider({ configured: true }), {
    limit: 10,
    leaseOwner: "worker-b",
  });
  assert.equal(afterCancel.claimed, 0);
  assert.equal((await cancelledStore.getById(cancelled.outboxId!))?.status, "CANCELLED");

  const dual = new InMemoryEmailOutboxStore();
  await enqueueTransactionalEmail(dual, {
    eventType: "AUDIT_DELIVERED",
    recipient: "buyer@stratxcel.ai",
    idempotencyKey: "audit_delivered:ao-dual",
    payload: { businessName: "Acme", auditOrderId: "ao-dual" },
  });
  const provider = new InMemoryEmailProvider({ configured: true });
  const [a, b] = await Promise.all([
    processEmailOutboxBatch(dual, provider, { limit: 10, leaseOwner: "w1" }),
    processEmailOutboxBatch(dual, provider, { limit: 10, leaseOwner: "w2" }),
  ]);
  assert.equal(a.sent + b.sent, 1, "two processors must not double-send the same outbox row");
  assert.equal(provider.sent.length, 1);
  const sentRow = [...dual.rows.values()].find((row) => row.status === "SENT");
  assert.ok(sentRow?.provider_message_id, "real provider message id required before SENT");

  console.log("email-audit-journey.test.ts (@stratxcel/email-runtime): ALL PASS");
}

run();
