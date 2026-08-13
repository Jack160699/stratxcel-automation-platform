// Run with: node --experimental-strip-types packages/email-runtime/src/__tests__/email-integration-safety.test.ts
//
// Static safety: email is a best-effort side effect after authoritative payment /
// mission / approval / handoff commits — never the authority itself.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..", "..");

function read(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

function run() {
  const webhook = read("app", "api", "webhook", "razorpay", "route.ts");
  const approvals = read("packages", "approvals", "src", "repository.ts");
  const handoff = read("packages", "human-handoff", "src", "repository.ts");
  const missionWorker = read("apps", "mission-worker", "src", "worker.ts");
  const systemHealth = read("app", "admin", "(shell)", "system", "page.tsx");
  const processRoute = read("app", "api", "internal", "email", "process", "route.ts");
  const complete = read("app", "api", "platform", "audit", "complete", "route.ts");
  const migration = read("supabase", "migrations", "20260813150000_transactional_email_outbox.sql");

  // Payment: email after mark processed, wrapped, cannot change handled semantics
  assert.ok(webhook.includes("issueEmailRecordsBestEffort"), "webhook must enqueue emails best-effort");
  assert.ok(webhook.includes("issueEmailNotificationsBestEffort"), "must call email-runtime helper");
  const markIdx = webhook.indexOf("markWebhookEventProcessed(supabase, claim.eventId, claim.token)");
  const emailIdx = webhook.indexOf("issueEmailRecordsBestEffort(supabase, processResult)");
  assert.ok(markIdx > 0 && emailIdx > markIdx, "email enqueue must run only after webhook event is marked processed");

  const emailHelper = webhook.slice(
    webhook.indexOf("async function issueEmailRecordsBestEffort"),
    webhook.indexOf("export const runtime")
  );
  assert.ok(/try\s*{/.test(emailHelper), "email helper must be try/catch wrapped");
  assert.ok(/catch \(err\)/.test(emailHelper), "email helper must catch errors");
  assert.equal(/return Response\.json/.test(emailHelper), false, "email helper must never produce HTTP responses");

  // Approvals / handoff / mission: best-effort after authoritative write
  assert.ok(approvals.includes("enqueueApprovalRequiredEmailBestEffort"), "approval request must notify");
  assert.ok(approvals.includes("Best-effort notification"), "approval email must be documented best-effort");
  assert.ok(handoff.includes("enqueueSupportEscalationEmailBestEffort"), "handoff must notify support");
  assert.ok(missionWorker.includes("enqueueMissionTerminalEmailBestEffort"), "mission worker must notify on terminal");
  assert.ok(missionWorker.includes("retryableFailure"), "mission worker must distinguish retryable failures");
  assert.ok(missionWorker.includes("AUDIT_GENERATION_JOB_TYPE"), "must keep automatic Audit worker path");
  assert.ok(missionWorker.includes("processEmailOutboxBatch"), "must host independent email processor loop");
  assert.equal(complete.includes("enqueueAuditDeliveredEmailBestEffort"), false, "staff Audit delivery must not enqueue customer Audit email");
  assert.equal(missionWorker.includes("enqueueAuditDeliveredEmailBestEffort"), false, "mission worker must not enqueue customer Audit email");

  // System health: not key-only LIVE
  assert.ok(systemHealth.includes("probeEmailSystemHealth"), "System Health must probe email honestly");
  assert.ok(systemHealth.includes("Email"), "System Health must show Email row");
  assert.equal(/Boolean\(process\.env\.RESEND_API_KEY\)/.test(systemHealth), false);

  // Processor gated by CRON_SECRET
  assert.ok(processRoute.includes("CRON_SECRET"), "email processor must require CRON_SECRET");
  assert.ok(processRoute.includes("processEmailOutboxBatch"), "email processor must process outbox");

  // Migration security
  assert.ok(migration.includes("enable row level security"), "email_outbox must enable RLS");
  assert.ok(migration.includes("revoke all on table public.email_outbox from public, anon, authenticated"), "no client writes");
  assert.ok(migration.includes("grant select, insert, update, delete on table public.email_outbox to service_role"), "service_role only");
  assert.ok(migration.includes("email_outbox_idempotency_unique_idx"), "idempotency unique index required");
  assert.ok(migration.includes("claim_email_outbox_batch"), "atomic claim RPC required");
  assert.ok(migration.includes("security definer"), "claim RPC is security definer");
  assert.ok(migration.includes("set search_path = public, pg_temp"), "search_path must be pinned");
  assert.ok(
    /revoke all on function public\.claim_email_outbox_batch[\s\S]*from public, anon, authenticated/i.test(migration),
    "claim RPC must not be executable by clients"
  );

  // No fake success patterns in provider
  const resend = read("packages", "email-runtime", "src", "providers", "resend.ts");
  assert.ok(resend.includes("MISSING_PROVIDER_MESSAGE_ID"), "must refuse success without provider id");
  assert.ok(resend.includes("NOT_CONFIGURED"), "must expose not-configured truthfully");
  assert.equal(/api\.resend\.com\/domains|RESEND_API\}\/domains/.test(resend), false, "sending-only runtime must not call domain-list APIs");
  assert.equal(/api\.resend\.com\/api-keys|RESEND_API\}\/api-keys/.test(resend), false, "must not call Resend API-key admin");
  assert.equal(/method:\s*"GET"/.test(resend), false, "Resend adapter must not issue GET account/domain probes");

  console.log("email-integration-safety.test.ts (@stratxcel/email-runtime): ALL PASS");
}

run();
