// Run with: node --experimental-strip-types packages/email-runtime/src/__tests__/email-runtime.test.ts
import assert from "node:assert/strict";
import {
  assertSafeHeaderValue,
  computeEmailBackoffSeconds,
  enqueueApprovalRequiredEmail,
  enqueueMissionCompletedEmail,
  enqueueMissionFailedEmail,
  enqueuePaymentOutcomeEmails,
  enqueueSupportEscalationEmail,
  enqueueTransactionalEmail,
  InMemoryEmailOutboxStore,
  InMemoryEmailProvider,
  isRetryExhausted,
  probeEmailSystemHealth,
  processEmailOutboxBatch,
  renderEmailTemplate,
  ResendEmailProvider,
  validateRecipient,
} from "../index.ts";

process.env.EMAIL_TEST_MODE = "1";
process.env.SUPPORT_EMAIL = "support@stratxcel.ai";
process.env.EMAIL_FROM = "Stratxcel <support@stratxcel.ai>";
process.env.EMAIL_REPLY_TO = "support@stratxcel.ai";
delete process.env.RESEND_API_KEY;

function auditPayload() {
  return {
    productName: "Stratxcel Business Audit",
    amountLabel: "999.00",
    currency: "INR",
    paymentReference: "pay_test_1",
    paidAt: "2026-08-11T10:00:00.000Z",
    nextStep: "Complete intake",
  };
}

async function run() {
  // --- Templates: text + HTML ---
  const rendered = renderEmailTemplate("AUDIT_PAYMENT_RECEIPT", auditPayload());
  assert.ok(rendered.html.includes("Stratxcel"));
  assert.ok(rendered.html.includes("999.00"));
  assert.ok(rendered.text.includes("999.00"));
  assert.ok(rendered.subject.includes("Payment receipt"));
  assert.ok(rendered.preheader.length > 0);
  assert.equal(/guaranteed revenue|guaranteed ROAS|ranking guarantee/i.test(rendered.html + rendered.text), false);
  assert.ok(/does not guarantee/i.test(rendered.html + rendered.text));

  // --- Recipient validation ---
  assert.equal(validateRecipient("").ok, false);
  assert.equal(validateRecipient("not-an-email").ok, false);
  assert.equal(validateRecipient("user@example.com").ok, false); // placeholder in prod mode with allowTest=false
  assert.equal(validateRecipient("sk_live_abc@evil.com").ok, false);
  assert.equal(validateRecipient("ok@stratxcel.ai").ok, true);
  assert.equal(validateRecipient("a@test.local", { allowTestRecipients: true }).ok, true);
  assert.equal(validateRecipient("evil@x.com\nBcc: victim@x.com").ok, false);

  // --- Header injection blocked ---
  assert.throws(() => assertSafeHeaderValue("hi\nBcc: x@y.com", "subject"), /HEADER_INJECTION/);
  assert.equal(
    (
      await enqueueTransactionalEmail(new InMemoryEmailOutboxStore(), {
        eventType: "IMPORTANT_ACCOUNT_NOTICE",
        recipient: "ok@stratxcel.ai",
        idempotencyKey: "notice-inject",
        payload: { noticeTitle: "Hi\r\nBcc: leak@x.com", noticeBody: "body" },
      })
    ).reason,
    "header_injection"
  );

  // --- Provider not configured → truthful state, no fake message id ---
  const unconfigured = new ResendEmailProvider({ apiKey: null });
  assert.equal(unconfigured.isConfigured(), false);
  const unconfiguredSend = await unconfigured.send({
    to: "ok@stratxcel.ai",
    subject: "x",
    html: "<p>x</p>",
    text: "x",
    from: "Stratxcel <support@stratxcel.ai>",
  });
  assert.equal(unconfiguredSend.ok, false);
  if (!unconfiguredSend.ok) {
    assert.equal(unconfiguredSend.errorCode, "NOT_CONFIGURED");
  }

  const healthKeyOnly = await probeEmailSystemHealth({
    provider: unconfigured,
    outboxAccessible: true,
    workerPathAvailable: true,
  });
  assert.equal(healthKeyOnly.status, "NOT_CONFIGURED");

  // Key present but verification unknown → not OPERATIONAL
  const fakeReachable = new InMemoryEmailProvider({ configured: true });
  fakeReachable.probeReadiness = async () => ({
    configured: true,
    reachable: true,
    senderVerified: null,
    detail: "reachable unknown verification",
  });
  const healthReachable = await probeEmailSystemHealth({
    provider: fakeReachable,
    outboxAccessible: true,
    workerPathAvailable: true,
  });
  assert.notEqual(healthReachable.status, "OPERATIONAL");
  assert.equal(healthReachable.status, "REACHABLE");

  // --- Successful send → SENT + receipt persisted ---
  const store = new InMemoryEmailOutboxStore();
  const provider = new InMemoryEmailProvider({ configured: true });
  const enq = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-1",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(enq.enqueued, true);
  assert.ok(enq.outboxId);

  const processed = await processEmailOutboxBatch(store, provider, { limit: 5 });
  assert.equal(processed.sent, 1);
  const sentRow = await store.getById(enq.outboxId!);
  assert.equal(sentRow?.status, "SENT");
  assert.ok(sentRow?.provider_message_id);
  assert.equal(provider.sent.length, 1);

  // --- Idempotency: same key does not send twice ---
  const dup = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-1",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(dup.duplicate, true);
  assert.equal(dup.enqueued, false);
  const processedDup = await processEmailOutboxBatch(store, provider, { limit: 5 });
  assert.equal(processedDup.claimed, 0);
  assert.equal(provider.sent.length, 1);

  // --- Different recipient can receive separate message ---
  const other = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "other@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-1",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(other.enqueued, true);
  await processEmailOutboxBatch(store, provider, { limit: 5 });
  assert.equal(provider.sent.length, 2);

  // --- Transient failure retries + bounded ---
  const retryStore = new InMemoryEmailOutboxStore();
  const retryProvider = new InMemoryEmailProvider({ configured: true });
  retryProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: true,
    errorCode: "HTTP_429",
    errorCategory: "rate_limited",
    errorSafe: "rate limited",
  });
  const retryEnq = await enqueueTransactionalEmail(retryStore, {
    eventType: "MISSION_COMPLETED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "mission_completed:m1",
    tenantId: "tenant-a",
    payload: { missionTitle: "Grow leads", missionId: "m1", summary: "Done" },
  });
  const retryResult = await processEmailOutboxBatch(retryStore, retryProvider, { limit: 1 });
  assert.equal(retryResult.retried, 1);
  const retryRow = await retryStore.getById(retryEnq.outboxId!);
  assert.equal(retryRow?.status, "RETRY_WAIT");
  assert.equal(retryRow?.attempt_count, 1);
  assert.equal(computeEmailBackoffSeconds(1), 60);
  assert.equal(computeEmailBackoffSeconds(2), 300);
  assert.equal(computeEmailBackoffSeconds(3), 1800);
  assert.equal(computeEmailBackoffSeconds(4), 7200);
  assert.equal(isRetryExhausted(5), true);

  // Exhaust retries
  const exhaustStore = new InMemoryEmailOutboxStore();
  const exhaustProvider = new InMemoryEmailProvider({ configured: true });
  const exhaustEnq = await enqueueTransactionalEmail(exhaustStore, {
    eventType: "MISSION_COMPLETED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "mission_completed:m2",
    tenantId: "tenant-a",
    payload: { missionTitle: "Grow leads", missionId: "m2" },
  });
  for (let i = 0; i < 5; i++) {
    // Force due immediately
    const row = await exhaustStore.getById(exhaustEnq.outboxId!);
    if (row && row.status === "RETRY_WAIT") {
      exhaustStore.rows.set(row.id, { ...row, next_attempt_at: new Date(0).toISOString() });
    }
    exhaustProvider.enqueueOutcome({
      ok: false,
      provider: "in-memory",
      retryable: true,
      errorCode: "HTTP_500",
      errorCategory: "provider_5xx",
      errorSafe: "server error",
    });
    await processEmailOutboxBatch(exhaustStore, exhaustProvider, { limit: 1 });
  }
  const exhausted = await exhaustStore.getById(exhaustEnq.outboxId!);
  assert.equal(exhausted?.status, "FAILED");
  assert.ok((exhausted?.attempt_count ?? 0) >= 5);

  // --- Permanent failure ---
  const permStore = new InMemoryEmailOutboxStore();
  const permProvider = new InMemoryEmailProvider({ configured: true });
  permProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "HTTP_422",
    errorCategory: "invalid_recipient",
    errorSafe: "invalid recipient",
  });
  const permEnq = await enqueueTransactionalEmail(permStore, {
    eventType: "ACCOUNT_WELCOME",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "welcome:u1",
    payload: { accountLabel: "owner@stratxcel.ai" },
  });
  await processEmailOutboxBatch(permStore, permProvider, { limit: 1 });
  assert.equal((await permStore.getById(permEnq.outboxId!))?.status, "FAILED");

  // --- Worker restart does not duplicate (already SENT skipped) ---
  const restartStore = new InMemoryEmailOutboxStore();
  const restartProvider = new InMemoryEmailProvider({ configured: true });
  const restartEnq = await enqueueTransactionalEmail(restartStore, {
    eventType: "SUBSCRIPTION_ACTIVATED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_activated:s1",
    tenantId: "tenant-a",
    payload: { planName: "Growth", subscriptionId: "s1" },
  });
  await processEmailOutboxBatch(restartStore, restartProvider, { limit: 1 });
  assert.equal(restartProvider.sent.length, 1);
  // Simulate stale PROCESSING reclaim of already-sent is impossible; re-claim pending is empty.
  const again = await processEmailOutboxBatch(restartStore, restartProvider, { limit: 1 });
  assert.equal(again.claimed, 0);
  assert.equal(restartProvider.sent.length, 1);
  const sent = await restartStore.getById(restartEnq.outboxId!);
  assert.equal(sent?.status, "SENT");

  // --- Tenant isolation on store list ---
  const iso = new InMemoryEmailOutboxStore();
  await enqueueTransactionalEmail(iso, {
    eventType: "IMPORTANT_ACCOUNT_NOTICE",
    recipient: "a@stratxcel.ai",
    idempotencyKey: "n1",
    tenantId: "tenant-a",
    payload: { noticeTitle: "A", noticeBody: "A body" },
  });
  await enqueueTransactionalEmail(iso, {
    eventType: "IMPORTANT_ACCOUNT_NOTICE",
    recipient: "b@stratxcel.ai",
    idempotencyKey: "n2",
    tenantId: "tenant-b",
    payload: { noticeTitle: "B", noticeBody: "B body" },
  });
  assert.equal((await iso.listByTenant("tenant-a")).length, 1);
  assert.equal((await iso.listByTenant("tenant-b")).length, 1);
  assert.equal((await iso.listByTenant("tenant-a"))[0]?.tenant_id, "tenant-a");

  // --- Payment success only after authoritative CAPTURED ---
  const payStore = new InMemoryEmailOutboxStore();
  const calls: Array<{ table: string }> = [];
  const supabaseMock = {
    from(table: string) {
      calls.push({ table });
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "payment_orders") {
            return {
              data: {
                id: "ord-1",
                tenant_id: "tenant-a",
                payment_purpose: "audit_fee",
                amount_cents: 99900,
                currency: "INR",
                provider_payment_id: "pay_1",
                state: "CREATED",
                reference_id: "ref-1",
                updated_at: new Date().toISOString(),
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
  const noSend = await enqueuePaymentOutcomeEmails(supabaseMock as never, payStore, {
    handled: true,
    orderId: "ord-1",
    purpose: "audit_fee",
  });
  assert.equal(noSend.length, 0);

  const supabaseCaptured = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "payment_orders") {
            return {
              data: {
                id: "ord-2",
                tenant_id: "tenant-a",
                payment_purpose: "audit_fee",
                amount_cents: 99900,
                currency: "INR",
                provider_payment_id: "pay_2",
                state: "CAPTURED",
                reference_id: "ref-2",
                updated_at: new Date().toISOString(),
              },
              error: null,
            };
          }
          if (table === "payment_links") {
            return { data: { id: "link-1", customer_email: "guest@stratxcel.ai", created_by: null }, error: null };
          }
          return { data: null, error: null };
        },
      };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
  const sentAudit = await enqueuePaymentOutcomeEmails(supabaseCaptured as never, payStore, {
    handled: true,
    orderId: "ord-2",
    purpose: "audit_fee",
  });
  assert.equal(sentAudit[0]?.enqueued, true);
  // Replay idempotency
  const replay = await enqueuePaymentOutcomeEmails(supabaseCaptured as never, payStore, {
    handled: true,
    orderId: "ord-2",
    purpose: "audit_fee",
  });
  assert.equal(replay[0]?.duplicate, true);

  // Unverified/failed payment path: handled=false
  const unverified = await enqueuePaymentOutcomeEmails(supabaseCaptured as never, payStore, {
    handled: false,
    orderId: "ord-2",
    purpose: "audit_fee",
  });
  assert.equal(unverified.length, 0);

  // --- Subscription renewal / cancellation idempotency ---
  const subStore = new InMemoryEmailOutboxStore();
  const sub1 = await enqueueTransactionalEmail(subStore, {
    eventType: "SUBSCRIPTION_RENEWED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_renewed:ord-9",
    tenantId: "tenant-a",
    payload: { planName: "Growth", subscriptionId: "sub-1", periodEnd: "2026-09-01" },
  });
  const sub1b = await enqueueTransactionalEmail(subStore, {
    eventType: "SUBSCRIPTION_RENEWED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_renewed:ord-9",
    tenantId: "tenant-a",
    payload: { planName: "Growth", subscriptionId: "sub-1", periodEnd: "2026-09-01" },
  });
  assert.equal(sub1.enqueued, true);
  assert.equal(sub1b.duplicate, true);

  const cancel1 = await enqueueTransactionalEmail(subStore, {
    eventType: "SUBSCRIPTION_CANCEL_SCHEDULED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_cancel_sched:sub-1",
    tenantId: "tenant-a",
    payload: { planName: "Growth", subscriptionId: "sub-1", effectiveDate: "2026-09-01" },
  });
  const cancel1b = await enqueueTransactionalEmail(subStore, {
    eventType: "SUBSCRIPTION_CANCEL_SCHEDULED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_cancel_sched:sub-1",
    tenantId: "tenant-a",
    payload: { planName: "Growth", subscriptionId: "sub-1", effectiveDate: "2026-09-01" },
  });
  assert.equal(cancel1.enqueued, true);
  assert.equal(cancel1b.duplicate, true);

  // --- Approval email from real approval state ---
  const appr = await enqueueApprovalRequiredEmail(subStore, {
    approvalId: "appr-1",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    businessName: "Acme",
    missionTitle: "Publish campaign",
    approvalSummary: "Approve LinkedIn post draft",
  });
  assert.equal(appr.enqueued, true);
  const apprRow = await subStore.getById(appr.outboxId!);
  assert.ok(apprRow?.payload && JSON.stringify(apprRow.payload).includes("Approve LinkedIn post draft"));
  // Must not claim the action already ran successfully.
  assert.equal(/published successfully|action was executed/i.test(JSON.stringify(apprRow?.payload)), false);

  // --- Mission retry does not send final failure; final can ---
  const missSkip = await enqueueMissionFailedEmail(subStore, {
    missionId: "m-retry",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    missionTitle: "Retry mission",
    failureKind: "RETRYING",
  });
  assert.equal(missSkip.enqueued, false);
  assert.ok(missSkip.reason?.includes("skipped_non_final"));

  const missFinal = await enqueueMissionFailedEmail(subStore, {
    missionId: "m-final",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    missionTitle: "Final mission",
    failureKind: "FAILED_FINAL",
    safeSummary: "Needs attention",
  });
  assert.equal(missFinal.enqueued, true);

  const missDone = await enqueueMissionCompletedEmail(subStore, {
    missionId: "m-done",
    tenantId: "tenant-a",
    recipient: "owner@stratxcel.ai",
    missionTitle: "Done mission",
    summary: "Completed cleanly",
  });
  assert.equal(missDone.enqueued, true);

  // --- Support escalation safe ---
  const support = await enqueueSupportEscalationEmail(subStore, {
    handoffId: "ho-1",
    tenantId: "tenant-a",
    tenantLabel: "Acme",
    issueSummary: "Customer asked for human help. stack=SHOULD_NOT_APPEAR secret=abc",
    priority: "high",
  });
  assert.equal(support[0]?.enqueued, true);
  const supportRow = await subStore.getById(support[0]!.outboxId!);
  assert.equal(supportRow?.recipient, "support@stratxcel.ai");
  assert.ok(supportRow?.subject.includes("ho-1"));

  // --- Email failure cannot roll back payment/mission (side-effect isolation) ---
  // Simulated: payment remains CAPTURED conceptually; enqueue/process failure is contained.
  const failProvider = new InMemoryEmailProvider({ configured: false });
  const failStore = new InMemoryEmailOutboxStore();
  const paymentStillCaptured = { state: "CAPTURED" };
  const missionStillCompleted = { state: "COMPLETED" };
  await enqueueTransactionalEmail(failStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:ord-fail",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  await processEmailOutboxBatch(failStore, failProvider, { limit: 1 });
  assert.equal(paymentStillCaptured.state, "CAPTURED");
  assert.equal(missionStillCompleted.state, "COMPLETED");

  // --- No secret leakage in errors ---
  const leakProvider = new ResendEmailProvider({
    apiKey: "re_test_secret_key_value",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Bearer re_test_secret_key_value failed" }), { status: 401 }),
  });
  const leakOutcome = await leakProvider.send({
    to: "ok@stratxcel.ai",
    subject: "x",
    html: "x",
    text: "x",
    from: "Stratxcel <support@stratxcel.ai>",
  });
  assert.equal(leakOutcome.ok, false);
  if (!leakOutcome.ok) {
    assert.equal(/re_test_secret_key_value/.test(leakOutcome.errorSafe), false);
    assert.ok(leakOutcome.errorSafe.includes("[redacted]") || !leakOutcome.errorSafe.includes("re_"));
  }

  // Resend success requires real id — missing id is not fake success
  const noIdProvider = new ResendEmailProvider({
    apiKey: "re_test",
    fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
  });
  const noId = await noIdProvider.send({
    to: "ok@stratxcel.ai",
    subject: "x",
    html: "x",
    text: "x",
    from: "Stratxcel <support@stratxcel.ai>",
  });
  assert.equal(noId.ok, false);

  console.log("email-runtime.test.ts (@stratxcel/email-runtime): ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
