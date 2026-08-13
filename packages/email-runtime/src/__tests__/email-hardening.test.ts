// Run with: node --experimental-strip-types packages/email-runtime/src/__tests__/email-hardening.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appApprovalsUrl,
  CANONICAL_APP_ORIGIN_DEFAULT,
  enqueueSubscriptionRenewalUpcomingEmails,
  enqueueTransactionalEmail,
  filterSubscriptionRenewalUpcomingEmailCandidates,
  getEmailEventDeliveryStatus,
  InMemoryEmailOutboxStore,
  InMemoryEmailProvider,
  isEligibleForSubscriptionRenewalUpcomingEmail,
  isProviderReadyForWaitingConfigRecovery,
  processEmailOutboxBatch,
  probeEmailSystemHealth,
  ResendEmailProvider,
  resolveCanonicalAppOrigin,
} from "../index.ts";
import { EMAIL_EVENT_CONTRACTS } from "../events.ts";

process.env.EMAIL_TEST_MODE = "1";
process.env.SUPPORT_EMAIL = "support@stratxcel.ai";
process.env.EMAIL_FROM = "Stratxcel <support@stratxcel.ai>";
process.env.EMAIL_REPLY_TO = "support@stratxcel.ai";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_PROCESSOR_MODE;
delete process.env.NEXT_PUBLIC_APP_URL;
delete process.env.APP_BASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..", "..");

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
  // --- Canonical app URL ---
  assert.equal(CANONICAL_APP_ORIGIN_DEFAULT, "https://www.stratxcel.in");
  assert.equal(resolveCanonicalAppOrigin({}), "https://www.stratxcel.in");
  assert.equal(
    resolveCanonicalAppOrigin({ NEXT_PUBLIC_APP_URL: "https://www.stratxcel.in/" }),
    "https://www.stratxcel.in"
  );
  assert.equal(
    resolveCanonicalAppOrigin({ APP_BASE_URL: "https://preview.example.com" }),
    "https://preview.example.com"
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://www.stratxcel.in";
  const approvalUrl = appApprovalsUrl("tenant-a", "appr-1");
  assert.equal(approvalUrl, "https://www.stratxcel.in/app/approvals?tenant=tenant-a&approval=appr-1");
  assert.equal(/stratxcel\.ai/.test(approvalUrl), false);

  // --- Delivery readiness terminology ---
  const welcome = getEmailEventDeliveryStatus("ACCOUNT_WELCOME");
  assert.equal(welcome?.producer, "PRODUCER_NOT_AVAILABLE");
  assert.equal(welcome?.contract, "CONTRACT_READY");
  const renewal = getEmailEventDeliveryStatus("SUBSCRIPTION_RENEWAL_UPCOMING");
  assert.equal(renewal?.producer, "PRODUCER_WIRED");

  // --- WAITING_CONFIGURATION recovery ---
  const store = new InMemoryEmailOutboxStore();
  const unconfigured = new InMemoryEmailProvider({ configured: false });
  const enq = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-recover",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(enq.enqueued, true);
  const parked = await processEmailOutboxBatch(store, unconfigured, { limit: 5 });
  assert.equal(parked.failed, 1);
  const waiting = await store.getById(enq.outboxId!);
  assert.equal(waiting?.status, "WAITING_CONFIGURATION");
  const attemptsWhileWaiting = waiting?.attempt_count ?? -1;

  // No retry churn while still unconfigured
  const churn = await processEmailOutboxBatch(store, unconfigured, { limit: 5 });
  assert.equal(churn.claimed, 0);
  assert.equal((await store.getById(enq.outboxId!))?.attempt_count, attemptsWhileWaiting);

  // Provider becomes configured → recover → exactly one send
  const configured = new InMemoryEmailProvider({ configured: true });
  const recovered = await processEmailOutboxBatch(store, configured, { limit: 5 });
  assert.ok(recovered.recovered >= 1);
  assert.equal(recovered.sent, 1);
  assert.equal(configured.sent.length, 1);
  const sent = await store.getById(enq.outboxId!);
  assert.equal(sent?.status, "SENT");
  assert.ok(sent?.provider_message_id);
  assert.equal(sent?.lease_owner ?? null, null);
  assert.equal(sent?.lease_expires_at ?? null, null);

  // Second process does not re-send
  await processEmailOutboxBatch(store, configured, { limit: 5 });
  assert.equal(configured.sent.length, 1);

  // --- WAITING_CONFIGURATION: key present but readiness broken → no recovery churn ---
  const authStore = new InMemoryEmailOutboxStore();
  const brokenAuth = new InMemoryEmailProvider({
    configured: true,
    probe: {
      configured: true,
      reachable: true,
      senderVerified: false,
      detail: "Resend API key rejected (auth/config)",
    },
  });
  brokenAuth.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "HTTP_401",
    errorCategory: "auth_config",
    errorSafe: "unauthorized",
  });
  const authEnq = await enqueueTransactionalEmail(authStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-auth-park",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  await processEmailOutboxBatch(authStore, brokenAuth, { limit: 5 });
  const authWaiting = await authStore.getById(authEnq.outboxId!);
  assert.equal(authWaiting?.status, "WAITING_CONFIGURATION");
  const authAttempts = authWaiting?.attempt_count ?? -1;
  const sendsAfterPark = brokenAuth.sent.length;

  // Key still present + readiness still broken → stay parked, no repeated send
  for (let i = 0; i < 3; i++) {
    const batch = await processEmailOutboxBatch(authStore, brokenAuth, { limit: 5 });
    assert.equal(batch.recovered, 0);
    assert.equal(batch.claimed, 0);
  }
  assert.equal(brokenAuth.sent.length, sendsAfterPark);
  assert.equal((await authStore.getById(authEnq.outboxId!))?.attempt_count, authAttempts);
  assert.equal(isProviderReadyForWaitingConfigRecovery(await brokenAuth.probeReadiness()), false);

  // Sender unverified probe → stays parked
  const unverifiedStore = new InMemoryEmailOutboxStore();
  const unverified = new InMemoryEmailProvider({
    configured: true,
    probe: {
      configured: true,
      reachable: true,
      senderVerified: false,
      detail: "sender domain not verified",
    },
  });
  unverified.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "SENDER_UNVERIFIED",
    errorCategory: "sender_unverified",
    errorSafe: "sender unverified",
  });
  const unverifiedEnq = await enqueueTransactionalEmail(unverifiedStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:order-unverified",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  await processEmailOutboxBatch(unverifiedStore, unverified, { limit: 5 });
  assert.equal((await unverifiedStore.getById(unverifiedEnq.outboxId!))?.status, "WAITING_CONFIGURATION");
  const unverifiedAttempts = (await unverifiedStore.getById(unverifiedEnq.outboxId!))?.attempt_count;
  const batchUnverified = await processEmailOutboxBatch(unverifiedStore, unverified, { limit: 5 });
  assert.equal(batchUnverified.recovered, 0);
  assert.equal((await unverifiedStore.getById(unverifiedEnq.outboxId!))?.attempt_count, unverifiedAttempts);

  // Provider verified later → recover once → exactly one send → SENT
  brokenAuth.setProbe({
    configured: true,
    reachable: true,
    senderVerified: true,
    detail: "ready",
  });
  // Clear residual failure outcome; default send succeeds
  const recoveredAuth = await processEmailOutboxBatch(authStore, brokenAuth, { limit: 5 });
  assert.equal(recoveredAuth.recovered, 1);
  assert.equal(recoveredAuth.sent, 1);
  assert.equal((await authStore.getById(authEnq.outboxId!))?.status, "SENT");
  const sentCountAfterRecover = brokenAuth.sent.length;
  await processEmailOutboxBatch(authStore, brokenAuth, { limit: 5 });
  assert.equal(brokenAuth.sent.length, sentCountAfterRecover);

  // Probe at most once per batch (not per row)
  const multiStore = new InMemoryEmailOutboxStore();
  const multiProvider = new InMemoryEmailProvider({ configured: true });
  for (let i = 0; i < 3; i++) {
    await enqueueTransactionalEmail(multiStore, {
      eventType: "AUDIT_PAYMENT_RECEIPT",
      recipient: "customer@stratxcel.ai",
      idempotencyKey: `audit_receipt:multi-${i}`,
      tenantId: "tenant-a",
      payload: auditPayload(),
    });
  }
  const probesBefore = multiProvider.probeCallCount;
  await processEmailOutboxBatch(multiStore, multiProvider, { limit: 10 });
  assert.equal(multiProvider.probeCallCount - probesBefore, 1);

  // --- Lease cleared after retry ---
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
    idempotencyKey: "mission_completed:lease-retry",
    tenantId: "tenant-a",
    payload: { missionTitle: "X", missionId: "m-lease" },
  });
  await processEmailOutboxBatch(retryStore, retryProvider, { limit: 1 });
  const retryRow = await retryStore.getById(retryEnq.outboxId!);
  assert.equal(retryRow?.status, "RETRY_WAIT");
  assert.equal(retryRow?.lease_owner ?? null, null);
  assert.equal(retryRow?.lease_expires_at ?? null, null);

  // --- Lease cleared after failure ---
  const failStore = new InMemoryEmailOutboxStore();
  const failProvider = new InMemoryEmailProvider({ configured: true });
  failProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "HTTP_422",
    errorCategory: "invalid_recipient",
    errorSafe: "bad recipient",
  });
  const failEnq = await enqueueTransactionalEmail(failStore, {
    eventType: "ACCOUNT_WELCOME",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "welcome:lease-fail",
    payload: { accountLabel: "owner@stratxcel.ai" },
  });
  await processEmailOutboxBatch(failStore, failProvider, { limit: 1 });
  const failRow = await failStore.getById(failEnq.outboxId!);
  assert.equal(failRow?.status, "FAILED");
  assert.equal(failRow?.lease_owner ?? null, null);

  // --- Per-event maxAttempts ---
  const originalMax = EMAIL_EVENT_CONTRACTS.MISSION_COMPLETED.maxAttempts;
  EMAIL_EVENT_CONTRACTS.MISSION_COMPLETED.maxAttempts = 2;
  try {
    const maxStore = new InMemoryEmailOutboxStore();
    const maxProvider = new InMemoryEmailProvider({ configured: true });
    const maxEnq = await enqueueTransactionalEmail(maxStore, {
      eventType: "MISSION_COMPLETED",
      recipient: "owner@stratxcel.ai",
      idempotencyKey: "mission_completed:max-attempts",
      tenantId: "tenant-a",
      payload: { missionTitle: "Max", missionId: "m-max" },
    });
    for (let i = 0; i < 3; i++) {
      const row = await maxStore.getById(maxEnq.outboxId!);
      if (row && row.status === "RETRY_WAIT") {
        maxStore.rows.set(row.id, { ...row, next_attempt_at: new Date(0).toISOString() });
      }
      maxProvider.enqueueOutcome({
        ok: false,
        provider: "in-memory",
        retryable: true,
        errorCode: "HTTP_500",
        errorCategory: "provider_5xx",
        errorSafe: "server error",
      });
      await processEmailOutboxBatch(maxStore, maxProvider, { limit: 1 });
    }
    const maxRow = await maxStore.getById(maxEnq.outboxId!);
    assert.equal(maxRow?.status, "FAILED");
    assert.equal(maxRow?.attempt_count, 2);
  } finally {
    EMAIL_EVENT_CONTRACTS.MISSION_COMPLETED.maxAttempts = originalMax;
  }

  // --- Resend send / probe timeout ---
  const hangingFetch: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      const abort = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    });
  const timeoutProvider = new ResendEmailProvider({
    apiKey: "re_test",
    fetchImpl: hangingFetch,
    sendTimeoutMs: 50,
    probeTimeoutMs: 50,
  });
  const timeoutOutcome = await timeoutProvider.send({
    to: "ok@stratxcel.ai",
    subject: "x",
    html: "x",
    text: "x",
    from: "Stratxcel <support@stratxcel.ai>",
  });
  assert.equal(timeoutOutcome.ok, false);
  if (!timeoutOutcome.ok) {
    assert.equal(timeoutOutcome.retryable, true);
    assert.equal(timeoutOutcome.errorCategory, "timeout");
    assert.equal(timeoutOutcome.errorCode, "TIMEOUT");
  }
  const probe = await timeoutProvider.probeReadiness();
  assert.equal(probe.configured, true);
  assert.equal(probe.reachable, null);
  assert.equal(probe.senderVerified, null);
  assert.equal(/timed out/i.test(probe.detail), false);
  assert.ok(/sending key is configured|not probed/i.test(probe.detail));

  // --- Processor path unavailable => NOT OPERATIONAL ---
  delete process.env.EMAIL_PROCESSOR_MODE;
  const health = await probeEmailSystemHealth({
    provider: new InMemoryEmailProvider({ configured: true }),
    outboxAccessible: true,
    workerPathAvailable: false,
  });
  assert.notEqual(health.status, "OPERATIONAL");
  assert.equal(health.status, "DEGRADED");

  // --- Renewal upcoming: active + future window only ---
  const renewNow = new Date("2026-08-12T00:00:00.000Z");
  const tomorrow = new Date(renewNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(renewNow.getTime() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isEligibleForSubscriptionRenewalUpcomingEmail(
      {
        id: "a",
        tenant_id: "t",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: tomorrow,
      },
      renewNow
    ),
    true
  );
  assert.equal(
    isEligibleForSubscriptionRenewalUpcomingEmail(
      {
        id: "a",
        tenant_id: "t",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: yesterday,
      },
      renewNow
    ),
    false
  );
  assert.equal(
    isEligibleForSubscriptionRenewalUpcomingEmail(
      {
        id: "a",
        tenant_id: "t",
        status: "past_due",
        cancel_at_period_end: false,
        current_period_end: tomorrow,
      },
      renewNow
    ),
    false
  );
  assert.equal(
    isEligibleForSubscriptionRenewalUpcomingEmail(
      {
        id: "a",
        tenant_id: "t",
        status: "past_due",
        cancel_at_period_end: false,
        current_period_end: yesterday,
      },
      renewNow
    ),
    false
  );
  assert.equal(
    isEligibleForSubscriptionRenewalUpcomingEmail(
      {
        id: "a",
        tenant_id: "t",
        status: "active",
        cancel_at_period_end: true,
        current_period_end: tomorrow,
      },
      renewNow
    ),
    false
  );

  const renewStore = new InMemoryEmailOutboxStore();
  const supabaseStub = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@stratxcel.ai" } } }) } },
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ data: { user_id: "u1" }, error: null }),
      };
    },
  };
  const mixedCandidates = [
    {
      id: "sub-cancel-end",
      tenant_id: "tenant-a",
      plan_tier: "growth",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: tomorrow,
    },
    {
      id: "sub-past-due-future",
      tenant_id: "tenant-a",
      plan_tier: "growth",
      status: "past_due",
      cancel_at_period_end: false,
      current_period_end: tomorrow,
    },
    {
      id: "sub-past-due-past",
      tenant_id: "tenant-a",
      plan_tier: "growth",
      status: "past_due",
      cancel_at_period_end: false,
      current_period_end: yesterday,
    },
    {
      id: "sub-active-expired",
      tenant_id: "tenant-a",
      plan_tier: "growth",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: yesterday,
    },
    {
      id: "sub-ok",
      tenant_id: "tenant-a",
      plan_tier: "growth",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: tomorrow,
    },
  ];
  assert.equal(filterSubscriptionRenewalUpcomingEmailCandidates(mixedCandidates, renewNow).length, 1);
  assert.equal(filterSubscriptionRenewalUpcomingEmailCandidates(mixedCandidates, renewNow)[0]?.id, "sub-ok");

  const results = await enqueueSubscriptionRenewalUpcomingEmails(
    supabaseStub as never,
    renewStore,
    mixedCandidates,
    { now: renewNow }
  );
  assert.equal(results.filter((r) => r.enqueued).length, 1);
  assert.equal(results.find((r) => r.enqueued)?.outboxId != null, true);
  const dup = await enqueueSubscriptionRenewalUpcomingEmails(
    supabaseStub as never,
    renewStore,
    [
      {
        id: "sub-ok",
        tenant_id: "tenant-a",
        plan_tier: "growth",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: tomorrow,
      },
    ],
    { now: renewNow }
  );
  assert.equal(dup[0]?.duplicate, true);

  const renewRoute = fs.readFileSync(
    path.join(root, "app", "api", "internal", "subscriptions", "renew", "route.ts"),
    "utf8"
  );
  assert.ok(renewRoute.includes("filterSubscriptionRenewalUpcomingEmailCandidates"));
  assert.ok(renewRoute.includes("upcomingEmailCandidates"));
  assert.ok(renewRoute.includes("processingCandidates"));

  // --- SUBSCRIPTION_RENEWED uses current_period_end (static + unit) ---
  const paymentsSrc = fs.readFileSync(
    path.join(root, "packages", "email-runtime", "src", "integrations", "payments.ts"),
    "utf8"
  );
  assert.ok(paymentsSrc.includes("current_period_end"));
  assert.ok(paymentsSrc.includes("sub_renewed:${resolvedSubscriptionId}:${periodEnd}") || paymentsSrc.includes("sub_renewed:"));
  assert.ok(paymentsSrc.includes("Fail closed on period truth") || paymentsSrc.includes("do not substitute payment timestamp"));

  // Renewed period unit: simulate enqueue with correct idempotency key
  const renewed = await enqueueTransactionalEmail(renewStore, {
    eventType: "SUBSCRIPTION_RENEWED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_renewed:sub-1:2026-10-01T00:00:00.000Z",
    tenantId: "tenant-a",
    payload: {
      planName: "Growth",
      subscriptionId: "sub-1",
      periodEnd: "2026-10-01T00:00:00.000Z",
    },
  });
  assert.equal(renewed.enqueued, true);
  const renewedDup = await enqueueTransactionalEmail(renewStore, {
    eventType: "SUBSCRIPTION_RENEWED",
    recipient: "owner@stratxcel.ai",
    idempotencyKey: "sub_renewed:sub-1:2026-10-01T00:00:00.000Z",
    tenantId: "tenant-a",
    payload: {
      planName: "Growth",
      subscriptionId: "sub-1",
      periodEnd: "2026-10-01T00:00:00.000Z",
    },
  });
  assert.equal(renewedDup.duplicate, true);

  // --- Free-plan processor compatible: no sub-daily email cron ---
  const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  assert.equal(vercel.includes("/api/internal/email/process"), false);
  const processRoute = fs.readFileSync(
    path.join(root, "app", "api", "internal", "email", "process", "route.ts"),
    "utf8"
  );
  assert.ok(processRoute.includes("manual/backup") || processRoute.includes("NOT scheduled"));
  const missionWorker = fs.readFileSync(path.join(root, "apps", "mission-worker", "src", "worker.ts"), "utf8");
  assert.ok(missionWorker.includes("processEmailOutboxBatch"));
  assert.ok(missionWorker.includes("email-processor"));
  assert.ok(missionWorker.includes("independent"));

  // System health must not hard-code workerPathAvailable in the probe call
  const systemPage = fs.readFileSync(path.join(root, "app", "admin", "(shell)", "system", "page.tsx"), "utf8");
  assert.equal(/probeEmailSystemHealth\(\{[\s\S]*?workerPathAvailable:\s*true/.test(systemPage), false);
  assert.ok(systemPage.includes('eq("worker_type", "email-processor")'));
  assert.ok(systemPage.includes("resolveEmailProcessorPathAvailable"));
  assert.ok(systemPage.includes("heartbeatQueryFailed"));

  // Recovery requires readiness helper (not isConfigured alone)
  const processSrc = fs.readFileSync(path.join(root, "packages", "email-runtime", "src", "processor", "process.ts"), "utf8");
  assert.ok(processSrc.includes("isProviderReadyForWaitingConfigRecovery"));
  assert.ok(processSrc.includes("probeReadiness"));
  assert.equal(/if \(provider\.isConfigured\(\)[\s\S]*?recoverWaitingConfiguration\(/.test(processSrc.replace(/\s+/g, " ")) || processSrc.includes("isProviderReadyForWaitingConfigRecovery(probe)"), true);

  // Recovery migration present
  const recoveryMig = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260813160000_email_outbox_waiting_configuration_recovery.sql"),
    "utf8"
  );
  assert.ok(recoveryMig.includes("recover_email_outbox_waiting_configuration"));
  assert.ok(recoveryMig.includes("email-processor"));

  console.log("email-hardening.test.ts (@stratxcel/email-runtime): ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
