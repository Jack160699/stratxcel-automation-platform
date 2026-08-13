// Run with: node --experimental-strip-types packages/email-runtime/src/__tests__/email-least-privilege-health.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enqueueTransactionalEmail,
  InMemoryEmailOutboxStore,
  InMemoryEmailProvider,
  isProviderReadyForWaitingConfigRecovery,
  probeEmailSystemHealth,
  processEmailOutboxBatch,
  ResendEmailProvider,
  sanitizeEmailHealthDetail,
} from "../index.ts";

process.env.EMAIL_TEST_MODE = "1";
process.env.SUPPORT_EMAIL = "support@stratxcel.ai";
process.env.EMAIL_FROM = "Stratxcel <support@stratxcel.ai>";
process.env.EMAIL_REPLY_TO = "support@stratxcel.ai";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_PROCESSOR_MODE;

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

function healthy(extra: Record<string, unknown> = {}) {
  return {
    outboxAccessible: true as boolean,
    workerPathAvailable: true,
    ...extra,
  };
}

async function run() {
  const resendSrc = fs.readFileSync(path.join(root, "packages", "email-runtime", "src", "providers", "resend.ts"), "utf8");
  const healthSrc = fs.readFileSync(path.join(root, "packages", "email-runtime", "src", "health.ts"), "utf8");
  const systemPage = fs.readFileSync(path.join(root, "app", "admin", "(shell)", "system", "page.tsx"), "utf8");

  // 1 + 2. Sending-only key does not require domain-list; health/probe never call account/domain APIs.
  const fetched: string[] = [];
  const trackingFetch: typeof fetch = async (url, init) => {
    fetched.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response(JSON.stringify({ id: "msg_real_1" }), { status: 200 });
  };
  const sendingOnly = new ResendEmailProvider({ apiKey: "re_sending_only_key", fetchImpl: trackingFetch });
  const probe = await sendingOnly.probeReadiness();
  assert.equal(probe.configured, true);
  assert.equal(probe.reachable, null);
  assert.equal(probe.senderVerified, null);
  assert.equal(fetched.length, 0, "probeReadiness must not call Resend");

  const sendOk = await sendingOnly.send({
    to: "ok@stratxcel.ai",
    subject: "x",
    html: "x",
    text: "x",
    from: "Stratxcel <support@stratxcel.ai>",
  });
  assert.equal(sendOk.ok, true);
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0]?.startsWith("POST "), true);
  assert.ok(fetched[0]?.includes("/emails"));
  assert.equal(fetched.some((u) => u.includes("/domains") || u.includes("/api-keys")), false);

  assert.equal(/api\.resend\.com\/domains|RESEND_API\}\/domains/.test(resendSrc), false);
  assert.equal(/api\.resend\.com\/domains|RESEND_API\}\/domains/.test(healthSrc), false);
  assert.equal(/api\.resend\.com\/domains/.test(systemPage), false);
  assert.ok(systemPage.includes("getLatestProviderEvidence"));
  const postgresSrc = fs.readFileSync(
    path.join(root, "packages", "email-runtime", "src", "outbox", "postgres-store.ts"),
    "utf8"
  );
  const evidenceFn = postgresSrc.slice(postgresSrc.indexOf("getLatestProviderEvidence"));
  assert.equal(/\brecipient\b/.test(evidenceFn), false, "provider evidence query must not select recipient");
  assert.ok(healthSrc.includes("deliveryProven"));
  assert.equal(healthSrc.includes("senderVerified === true") && healthSrc.includes("OPERATIONAL") && /probe\.senderVerified === true[\s\S]*OPERATIONAL/.test(healthSrc), false);

  // 3. Key presence alone is not OPERATIONAL.
  const keyOnly = await probeEmailSystemHealth({
    provider: sendingOnly,
    outboxAccessible: true,
    workerPathAvailable: true,
  });
  assert.notEqual(keyOnly.status, "OPERATIONAL");
  assert.equal(keyOnly.checks.deliveryProven, false);

  // 4. Healthy worker + outbox without real delivery proof is not OPERATIONAL.
  const unproven = await probeEmailSystemHealth({
    provider: new InMemoryEmailProvider({ configured: true }),
    ...healthy(),
  });
  assert.notEqual(unproven.status, "OPERATIONAL");
  assert.equal(unproven.status, "REACHABLE_UNPROVEN");

  // 5. Real provider success with provider_message_id can supply delivery proof.
  const store = new InMemoryEmailOutboxStore();
  const provider = new InMemoryEmailProvider({ configured: true });
  const enq = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer-secret@leak.example",
    idempotencyKey: "audit_receipt:least-priv-1",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(enq.enqueued, true);
  const processed = await processEmailOutboxBatch(store, provider, { limit: 5 });
  assert.equal(processed.sent, 1);
  const sentRow = await store.getById(enq.outboxId!);
  assert.equal(sentRow?.status, "SENT");
  assert.ok(sentRow?.provider_message_id);
  const evidence = await store.getLatestProviderEvidence();
  assert.equal(evidence.kind, "delivery_proof");
  assert.equal(evidence.hasProviderMessageId, true);
  const operational = await probeEmailSystemHealth({
    provider,
    ...healthy(),
    providerEvidence: evidence,
  });
  assert.equal(operational.status, "OPERATIONAL");
  assert.equal(operational.checks.deliveryProven, true);

  // 8 + 9. No recipient address or secrets in health details.
  const dumped = JSON.stringify(operational);
  assert.equal(dumped.includes("customer-secret@leak.example"), false);
  assert.equal(dumped.includes("leak.example"), false);
  assert.equal(dumped.includes("re_sending_only_key"), false);
  assert.equal(/re_[A-Za-z0-9_]+/.test(dumped), false);
  assert.equal(sanitizeEmailHealthDetail("failed for a@b.com Bearer re_live_abc").includes("a@b.com"), false);
  assert.equal(sanitizeEmailHealthDetail("Bearer re_live_abc").includes("re_live_abc"), false);

  // 6. Auth/config failure after earlier success degrades health.
  provider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "HTTP_401",
    errorCategory: "auth_config",
    errorSafe: "unauthorized for customer-secret@leak.example",
  });
  const later = await enqueueTransactionalEmail(store, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer-secret@leak.example",
    idempotencyKey: "audit_receipt:least-priv-auth",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  await processEmailOutboxBatch(store, provider, { limit: 5 });
  const authRow = await store.getById(later.outboxId!);
  assert.equal(authRow?.status, "WAITING_CONFIGURATION");
  const afterAuth = await store.getLatestProviderEvidence();
  assert.equal(afterAuth.kind, "auth_config");
  const degraded = await probeEmailSystemHealth({
    provider,
    ...healthy(),
    providerEvidence: afterAuth,
  });
  assert.equal(degraded.status, "DEGRADED");
  assert.notEqual(degraded.status, "OPERATIONAL");
  assert.equal(JSON.stringify(degraded).includes("customer-secret@leak.example"), false);

  // 7. Sender-unverified rejection degrades health.
  const unverifiedStore = new InMemoryEmailOutboxStore();
  const unverifiedProvider = new InMemoryEmailProvider({ configured: true });
  unverifiedProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: false,
    errorCode: "SENDER_UNVERIFIED",
    errorCategory: "sender_unverified",
    errorSafe: "domain not verified for customer-secret@leak.example",
  });
  await enqueueTransactionalEmail(unverifiedStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer-secret@leak.example",
    idempotencyKey: "audit_receipt:least-priv-unverified",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  await processEmailOutboxBatch(unverifiedStore, unverifiedProvider, { limit: 5 });
  const unverifiedEvidence = await unverifiedStore.getLatestProviderEvidence();
  assert.equal(unverifiedEvidence.kind, "sender_unverified");
  const unverifiedHealth = await probeEmailSystemHealth({
    provider: unverifiedProvider,
    ...healthy(),
    providerEvidence: unverifiedEvidence,
  });
  assert.equal(unverifiedHealth.status, "SENDER_UNVERIFIED");
  assert.equal(JSON.stringify(unverifiedHealth).includes("customer-secret@leak.example"), false);

  // Missing key → NOT_CONFIGURED
  const missing = await probeEmailSystemHealth({
    provider: new ResendEmailProvider({ apiKey: null }),
    ...healthy(),
  });
  assert.equal(missing.status, "NOT_CONFIGURED");

  // Processor/outbox unavailable → DEGRADED even with delivery proof
  const outboxDown = await probeEmailSystemHealth({
    provider,
    outboxAccessible: false,
    workerPathAvailable: true,
    providerEvidence: evidence,
  });
  assert.equal(outboxDown.status, "DEGRADED");
  const workerDown = await probeEmailSystemHealth({
    provider,
    outboxAccessible: true,
    workerPathAvailable: false,
    providerEvidence: evidence,
  });
  assert.equal(workerDown.status, "DEGRADED");

  // Sending-only Resend probe is not enough for WAITING_CONFIGURATION recovery after auth failure
  assert.equal(
    isProviderReadyForWaitingConfigRecovery(
      { configured: true, reachable: null, senderVerified: null },
      afterAuth
    ),
    false
  );
  assert.equal(
    isProviderReadyForWaitingConfigRecovery(
      { configured: true, reachable: null, senderVerified: null },
      { kind: "none", observedAt: null, hasProviderMessageId: false, errorCode: null }
    ),
    true
  );

  // 10. Existing outbox/idempotency/retry behavior is unchanged.
  const retryStore = new InMemoryEmailOutboxStore();
  const retryProvider = new InMemoryEmailProvider({ configured: true });
  const first = await enqueueTransactionalEmail(retryStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:least-priv-idem",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(first.enqueued, true);
  const dup = await enqueueTransactionalEmail(retryStore, {
    eventType: "AUDIT_PAYMENT_RECEIPT",
    recipient: "customer@stratxcel.ai",
    idempotencyKey: "audit_receipt:least-priv-idem",
    tenantId: "tenant-a",
    payload: auditPayload(),
  });
  assert.equal(dup.duplicate, true);
  retryProvider.enqueueOutcome({
    ok: false,
    provider: "in-memory",
    retryable: true,
    errorCode: "HTTP_429",
    errorCategory: "rate_limited",
    errorSafe: "rate limited",
  });
  const retryResult = await processEmailOutboxBatch(retryStore, retryProvider, { limit: 1 });
  assert.equal(retryResult.retried, 1);
  const retryRow = await retryStore.getById(first.outboxId!);
  assert.equal(retryRow?.status, "RETRY_WAIT");
  retryStore.rows.set(retryRow!.id, { ...retryRow!, next_attempt_at: new Date(0).toISOString() });
  const retrySent = await processEmailOutboxBatch(retryStore, retryProvider, { limit: 1 });
  assert.equal(retrySent.sent, 1);
  assert.equal((await retryStore.getById(first.outboxId!))?.status, "SENT");
  assert.ok((await retryStore.getById(first.outboxId!))?.provider_message_id);

  console.log("email-least-privilege-health.test.ts (@stratxcel/email-runtime): ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
