import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { parseInboundWhatsAppWebhook, parseWhatsAppStatusUpdates, verifyWhatsAppWebhookSignature } from "@stratxcel/whatsapp";
import {
  createServiceClient as createWhatsAppClient,
  findActiveBindingByPhoneNumberId,
  recordUnmatchedEvent,
  updateWhatsAppMessageStatus,
  updateAgentChannelMessageStatus,
  updateAuditDeliveryEventStatus,
} from "@stratxcel/whatsapp";
import { createServiceClient as createQueueClient, createPostgresQueueAdapter, recordWorkerHeartbeat, getWorkerHealth } from "@stratxcel/queue";

const WORKER_TYPE = "whatsapp-worker" as const;
const INSTANCE_ID = `${os.hostname()}-${process.pid}-webhook`;
const VERSION = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Standalone Meta webhook receiver for WhatsApp — separated from the
 * Next.js dashboard app precisely so a slow/failing mission never blocks
 * Meta's webhook delivery (Meta expects a fast 200 and will disable the
 * webhook after repeated timeouts). This process does exactly four
 * things: verify, normalize, resolve tenant, and enqueue — it never
 * processes conversation logic in-process (see processor.ts) and never
 * calls into @stratxcel/missions directly.
 */

const PORT = Number(process.env.PORT ?? 8081);

// Lazy + memoized: constructing these at module load (rather than on
// first actual use) would make importing this file for tests/tooling
// require live Supabase env vars just to load the module — exactly the
// failure mode NODE_ENV==="test" below is trying to avoid.
let _queue: ReturnType<typeof createPostgresQueueAdapter> | undefined;
function getQueue() {
  if (!_queue) _queue = createPostgresQueueAdapter(createQueueClient());
  return _queue;
}
let _whatsappClient: ReturnType<typeof createWhatsAppClient> | undefined;
function getWhatsAppClient() {
  if (!_whatsappClient) _whatsappClient = createWhatsAppClient();
  return _whatsappClient;
}

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export async function handleVerification(url: URL, res: http.ServerResponse) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(challenge ?? "");
    return;
  }
  res.writeHead(403);
  res.end("verification failed");
}

/**
 * Durable-ack contract: HTTP 200 is only ever returned once every message
 * and status update in this delivery has reached a durable outcome —
 * (A) queued for a bound, inbound-enabled tenant, (B) an intentional
 * policy drop because inbound is disabled for that binding, (C) a
 * recorded unmatched-event for an unbound phone_number_id, or (D)
 * resolved through existing idempotency (queue_jobs_whatsapp_provider_idempotency_idx
 * for messages, update_whatsapp_message_status's own no-regression guard
 * for statuses). None of these is "wait for full CRM/conversation
 * processing" — that stays entirely in processor.ts; this only waits for
 * the fast, durable persistence step. If ANY of that persistence throws
 * (a genuine DB/network failure), the whole delivery is answered with a
 * non-2xx so Meta redelivers — safe precisely because every idempotency
 * key here is permanent and provider-derived, so a redelivery of a
 * partially-persisted batch can never double-process the messages that
 * did already land.
 */
export async function handleInbound(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps?: { queue?: ReturnType<typeof createPostgresQueueAdapter>; whatsapp?: ReturnType<typeof createWhatsAppClient> }
) {
  const queue = deps?.queue ?? getQueue();
  const whatsapp = deps?.whatsapp ?? getWhatsAppClient();
  const rawBody = await readRawBody(req);

  if (!verifyWhatsAppWebhookSignature(rawBody, (req.headers["x-hub-signature-256"] as string | undefined) ?? null)) {
    res.writeHead(401);
    res.end("invalid signature");
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (err) {
    console.error("[whatsapp-worker] malformed JSON body:", err instanceof Error ? err.message : String(err));
    res.writeHead(400);
    res.end("malformed json");
    return;
  }

  let messages: ReturnType<typeof parseInboundWhatsAppWebhook>;
  let statusUpdates: ReturnType<typeof parseWhatsAppStatusUpdates>;
  try {
    messages = parseInboundWhatsAppWebhook(parsedBody);
    statusUpdates = parseWhatsAppStatusUpdates(parsedBody);
  } catch (err) {
    console.error("[whatsapp-worker] malformed webhook payload:", err instanceof Error ? err.message : String(err));
    res.writeHead(400);
    res.end("malformed payload");
    return;
  }

  try {
    for (const message of messages) {
      // Routing is by phone_number_id — the receiving business number —
      // never by the sender's phone number. No active binding means we
      // record a redacted unmatched event and stop. We never guess which
      // tenant this belongs to, and we never send an outbound response to
      // an unrouted number.
      const binding = await findActiveBindingByPhoneNumberId(whatsapp, message.phoneNumberId);

      if (!binding) {
        console.warn(`[whatsapp-worker] OPERATIONS WARNING: inbound message for unbound phone_number_id=${message.phoneNumberId}`);
        await recordUnmatchedEvent(whatsapp, {
          phoneNumberId: message.phoneNumberId,
          wabaId: message.wabaId,
          providerMessageId: message.providerMessageId,
          body: message.body,
        });
        continue; // durable outcome C
      }

      if (!binding.inbound_enabled) {
        console.warn(`[whatsapp-worker] inbound disabled for tenant=${binding.tenant_id} phone_number_id=${message.phoneNumberId}, dropping`);
        continue; // durable outcome B — an intentional policy drop, not an error
      }

      // Idempotency key = provider message ID: Meta can and does redeliver
      // webhooks (at-least-once delivery). Enqueueing the same message ID
      // twice — whether the first is still in flight or already
      // SUCCEEDED — resolves to the same job (queue_jobs_whatsapp_provider_idempotency_idx
      // is permanent, unlike the generic active-only dedup), so
      // reprocessing never double-creates a lead/response for one message.
      await queue.enqueue({
        tenantId: binding.tenant_id,
        jobType: "whatsapp.process_inbound",
        payload: { message, phoneBindingId: binding.id },
        idempotencyKey: `whatsapp_message:${message.providerMessageId}`,
        traceId: crypto.randomUUID(),
      }); // durable outcome A/D
    }

    // Delivery-receipt updates (sent/delivered/read/failed) — cheap,
    // idempotent, tenant-scoped single-row updates. They still block the
    // ack (a transient DB failure here must not be silently swallowed as
    // if it were handled — see the catch below), but never touch the
    // queue and never wait on conversation processing.
    for (const update of statusUpdates) {
      const binding = await findActiveBindingByPhoneNumberId(whatsapp, update.phoneNumberId);
      if (!binding) continue; // same "never guess the tenant" rule as inbound messages
      const result = await updateWhatsAppMessageStatus(whatsapp, { tenantId: binding.tenant_id, providerMessageId: update.providerMessageId, status: update.status });
      // A WhatsApp Agent reply (see agent_channel_messages) has no
      // whatsapp_messages row to update — try that correlation path only
      // when the lead-side update found nothing, so this never masks a
      // genuine lead-message status update.
      if (!result.updated) {
        await updateAgentChannelMessageStatus(whatsapp, { providerMessageId: update.providerMessageId, status: update.status }).catch((err) =>
          console.error("[whatsapp-worker] agent-channel status correlation failed:", err instanceof Error ? err.message : String(err))
        );
      }

      // Correlate with audit_delivery_events for product delivery (e.g. Audit reports)
      await updateAuditDeliveryEventStatus(whatsapp, { providerMessageId: update.providerMessageId, status: update.status }).catch((err) =>
        console.error("[whatsapp-worker] audit-delivery status correlation failed:", err instanceof Error ? err.message : String(err))
      );
    }
  } catch (err) {
    // A genuine failure reaching a durable outcome for this delivery —
    // Meta must redeliver. Nothing above has an ambiguous partial-success
    // state that a redelivery could double-apply: unmatched-event
    // recording, queue enqueue, and status updates are all themselves
    // idempotent, so re-running this whole loop from scratch on retry is
    // always safe.
    console.error("[whatsapp-worker] durable persistence failed, returning 5xx for Meta redelivery:", err instanceof Error ? err.message : String(err));
    res.writeHead(503);
    res.end("temporary failure");
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health" && req.method === "GET") {
    getWorkerHealth(getWhatsAppClient(), WORKER_TYPE)
      .then((report) => {
        const httpStatus = report.status === "unavailable" ? 503 : 200;
        res.writeHead(httpStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...report, version: VERSION, role: "webhook" }));
      })
      .catch((err) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "unavailable", reason: err instanceof Error ? err.message : String(err) }));
      });
    return;
  }

  if (url.pathname !== "/webhook") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (req.method === "GET") {
    handleVerification(url, res).catch((err) => {
      console.error("[whatsapp-worker] verification error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  if (req.method === "POST") {
    handleInbound(req, res).catch((err) => {
      // Only reachable for a genuinely unexpected failure BEFORE
      // handleInbound's own try/catch could run (e.g. the raw request
      // stream itself erroring) — every expected failure mode inside
      // handleInbound already writes its own response and returns.
      console.error("[whatsapp-worker] unexpected inbound handler error:", err);
      if (!res.headersSent) {
        res.writeHead(503);
        res.end("temporary failure");
      }
    });
    return;
  }

  res.writeHead(405);
  res.end();
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[whatsapp-worker] listening on :${PORT}`);
  });
  recordWorkerHeartbeat(getWhatsAppClient(), { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
    console.error("[whatsapp-worker] initial heartbeat failed:", err)
  );
  setInterval(() => {
    recordWorkerHeartbeat(getWhatsAppClient(), { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
      console.error("[whatsapp-worker] heartbeat failed:", err)
    );
  }, HEARTBEAT_INTERVAL_MS);
}

export { server };
