import http from "node:http";
import os from "node:os";
import { createServiceClient as createQueueClient, createPostgresQueueAdapter, isKillSwitchActive, recordWorkerHeartbeat, getWorkerHealth } from "@stratxcel/queue";
import {
  createServiceClient as createWhatsAppClient,
  processInboundMessage,
  sendOutboundWhatsAppMessage,
  isAutoReplyEnabled,
  type ParsedInboundWhatsAppMessage,
  type ProcessInboundResult,
} from "@stratxcel/whatsapp";

/**
 * The async half of the WhatsApp pipeline: claims 'whatsapp.process_inbound'
 * jobs enqueued by server.ts and runs the actual conversation logic
 * (@stratxcel/whatsapp's processInboundMessage) — kept in a separate
 * process/loop from the webhook receiver so a slow conversation step can
 * never delay Meta's webhook ack.
 */

const POLL_INTERVAL_MS = Number(process.env.WHATSAPP_PROCESSOR_POLL_INTERVAL_MS ?? 3000);
const WORKER_TYPE = "whatsapp-worker" as const;
const INSTANCE_ID = `${os.hostname()}-${process.pid}-processor`;
const LEASE_OWNER = `whatsapp-processor-${INSTANCE_ID}`;
const JOB_TYPE = "whatsapp.process_inbound";
const VERSION = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const HEALTH_PORT = Number(process.env.WHATSAPP_PROCESSOR_PORT ?? 8084);

/**
 * Automatic-reply gate, run only after processInboundMessage has already
 * persisted the inbound message/lead/conversation/shadow-response state —
 * this function decides only whether that ALREADY-RECORDED proposed
 * response also gets sent for real, through the exact same choke point
 * (sendOutboundWhatsAppMessage) that dashboard/manual sends use. There is
 * no separate, weaker send path here.
 *
 * Four independent conditions must all hold before an automatic send is
 * even attempted:
 *   1. WHATSAPP_AUTO_REPLY_ENABLED=true (this function's own gate — the
 *      worker-only cutover control; human/dashboard sends never read it)
 *   2. result.proposedResponse is non-null (implies the inbound message was
 *      text, matched/fell back through the compiler, and produced a real
 *      draft — media/opt-out/escalation all already resolve to null here)
 *   3. result.optedOut === false (checked explicitly, even though it's
 *      already implied by proposedResponse being null today, as defense in
 *      depth against process-inbound.ts changing shape later)
 *   4. result.escalated === false (same defense-in-depth reasoning)
 *
 * sendOutboundWhatsAppMessage itself still re-checks everything else
 * (integration mode, active outbound binding, legacy-bot zero-send,
 * kill switches, conversation paused/handoff, 24h window, template/consent
 * rules, idempotency) — this gate only decides whether to ask, never
 * whether the ask is allowed to succeed.
 *
 * The idempotency key is deterministic — whatsapp_auto_reply:<providerMessageId>,
 * never a random UUID — specifically so a Meta webhook redelivery (already
 * a no-op for the inbound side via queue_jobs_whatsapp_provider_idempotency_idx
 * and whatsapp_messages' own provider_message_id uniqueness) can never
 * cause a second automated send either: recordWhatsAppMessage's own
 * idempotency_key uniqueness makes a retry with the same key resolve to
 * `alreadySent: true` without ever calling the adapter again.
 *
 * A typed safety rejection ({ok:false}) from sendOutboundWhatsAppMessage —
 * kill switch, paused conversation, no active binding, consent required,
 * etc. — is logged and left alone; it is a permanent policy decision for
 * this event, not a transient error, so it must never be retried by
 * throwing here. An unexpected thrown error (e.g. a genuine DB outage
 * during the lead/binding lookup, which happens before
 * sendOutboundWhatsAppMessage's own internal try/catch around the actual
 * Meta call) is deliberately NOT caught here — it propagates up to
 * processOnce's catch, which fails the whole job for a bounded, backed-off
 * retry via the existing queue semantics. That retry is safe for exactly
 * the same idempotency-key reason: it can re-run processInboundMessage
 * (already idempotent) and re-attempt the send with the same key without
 * risk of a duplicate send.
 */
export async function maybeSendAutomaticReply(
  supabase: ReturnType<typeof createWhatsAppClient>,
  tenantId: string,
  message: ParsedInboundWhatsAppMessage,
  result: ProcessInboundResult
): Promise<void> {
  if (!isAutoReplyEnabled()) return;
  if (!result.proposedResponse) return;
  if (result.optedOut) return;
  if (result.escalated) return;

  const idempotencyKey = `whatsapp_auto_reply:${message.providerMessageId}`;
  const outcome = await sendOutboundWhatsAppMessage(supabase, {
    tenantId,
    leadId: result.leadId,
    body: result.proposedResponse,
    idempotencyKey,
  });

  if (!outcome.ok) {
    console.warn(`[whatsapp-processor] automatic reply not sent (${outcome.reason})`, {
      tenantId,
      leadId: result.leadId,
      providerMessageId: message.providerMessageId,
    });
  }
}

export async function processOnce(
  supabase: ReturnType<typeof createWhatsAppClient>,
  queue: ReturnType<typeof createPostgresQueueAdapter>,
  whatsappClient: ReturnType<typeof createWhatsAppClient>
): Promise<boolean> {
  const kill = await isKillSwitchActive(supabase, [{ scope: "global_hermes" }, { scope: "worker_type", scopeId: WORKER_TYPE }]);
  if (kill.active) return false;

  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes: [JOB_TYPE] });
  if (!job) return false;

  const tenantKill = await isKillSwitchActive(supabase, [{ scope: "tenant", scopeId: job.tenant_id }]);
  if (tenantKill.active) {
    await queue.fail({
      jobId: job.id,
      leaseOwner: LEASE_OWNER,
      error: { message: `kill switch active for tenant: ${tenantKill.reason ?? "no reason given"}`, retryable: true },
    });
    return true;
  }

  try {
    const { message, phoneBindingId } = job.payload as { message: ParsedInboundWhatsAppMessage; phoneBindingId?: string | null };
    const result = await processInboundMessage(whatsappClient, { tenantId: job.tenant_id, message, phoneBindingId });
    await maybeSendAutomaticReply(whatsappClient, job.tenant_id, message, result);
    await queue.complete({ jobId: job.id, leaseOwner: LEASE_OWNER });
  } catch (err) {
    await queue.fail({
      jobId: job.id,
      leaseOwner: LEASE_OWNER,
      error: { message: err instanceof Error ? err.message : String(err), retryable: true },
    });
  }
  return true;
}

function startHealthServer(supabase: ReturnType<typeof createWhatsAppClient>) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      getWorkerHealth(supabase, WORKER_TYPE)
        .then((report) => {
          const httpStatus = report.status === "unavailable" ? 503 : 200;
          res.writeHead(httpStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...report, version: VERSION, role: "processor" }));
        })
        .catch((err) => {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "unavailable", reason: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, () => console.log(`[whatsapp-processor] health server listening on :${HEALTH_PORT}`));
  return server;
}

if (process.env.NODE_ENV !== "test") {
  const queueClient = createQueueClient();
  const queue = createPostgresQueueAdapter(queueClient);
  const whatsappClient = createWhatsAppClient();

  startHealthServer(queueClient);
  recordWorkerHeartbeat(queueClient, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
    console.error("[whatsapp-processor] initial heartbeat failed:", err)
  );

  console.log(`[whatsapp-processor] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}`);
  setInterval(() => {
    processOnce(queueClient, queue, whatsappClient)
      .then((claimed) => {
        recordWorkerHeartbeat(queueClient, {
          workerType: WORKER_TYPE,
          instanceId: INSTANCE_ID,
          status: claimed ? "busy" : "idle",
          version: VERSION,
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("[whatsapp-processor] poll cycle failed:", err);
        recordWorkerHeartbeat(queueClient, {
          workerType: WORKER_TYPE,
          instanceId: INSTANCE_ID,
          status: "degraded",
          version: VERSION,
          lastError: { message: err instanceof Error ? err.message : String(err) },
        }).catch(() => {});
      });
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[whatsapp-processor] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
