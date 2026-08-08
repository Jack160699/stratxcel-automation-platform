import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { parseInboundWhatsAppWebhook, verifyWhatsAppWebhookSignature } from "@stratxcel/whatsapp";
import { createServiceClient as createWhatsAppClient, findActiveBindingByPhoneNumberId, recordUnmatchedEvent } from "@stratxcel/whatsapp";
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
 *
 * Not deployed anywhere yet. The Python/Flask bot in ai-automation-system
 * remains the production WhatsApp system and rollback target until this
 * is verified functionally equivalent and explicitly approved for cutover.
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

async function handleVerification(url: URL, res: http.ServerResponse) {
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

async function handleInbound(req: http.IncomingMessage, res: http.ServerResponse) {
  const rawBody = await readRawBody(req);

  if (!verifyWhatsAppWebhookSignature(rawBody, (req.headers["x-hub-signature-256"] as string | undefined) ?? null)) {
    res.writeHead(401);
    res.end("invalid signature");
    return;
  }

  // Acknowledge immediately — Meta only cares that we received it.
  // Tenant resolution and enqueueing continue after the response is sent.
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));

  const messages = parseInboundWhatsAppWebhook(JSON.parse(rawBody));

  for (const message of messages) {
    // Routing is by phone_number_id — the receiving business number —
    // never by the sender's phone number. No active binding means we
    // acknowledge safely, record a redacted unmatched event, and stop.
    // We never guess which tenant this belongs to, and we never send an
    // outbound response to an unrouted number.
    const binding = await findActiveBindingByPhoneNumberId(getWhatsAppClient(), message.phoneNumberId);

    if (!binding) {
      console.warn(`[whatsapp-worker] OPERATIONS WARNING: inbound message for unbound phone_number_id=${message.phoneNumberId}`);
      await recordUnmatchedEvent(getWhatsAppClient(), {
        phoneNumberId: message.phoneNumberId,
        wabaId: message.wabaId,
        providerMessageId: message.providerMessageId,
        body: message.body,
      });
      continue;
    }

    if (!binding.inbound_enabled) {
      console.warn(`[whatsapp-worker] inbound disabled for tenant=${binding.tenant_id} phone_number_id=${message.phoneNumberId}, dropping`);
      continue;
    }

    // Idempotency key = provider message ID: Meta can and does redeliver
    // webhooks (at-least-once delivery). Enqueueing the same message ID
    // twice while the first is still in flight resolves to the same job
    // (see packages/queue's dedup on tenant_id + idempotency_key), so
    // reprocessing never double-creates a lead/response for one message.
    await getQueue().enqueue({
      tenantId: binding.tenant_id,
      jobType: "whatsapp.process_inbound",
      payload: { message },
      idempotencyKey: `whatsapp_message:${message.providerMessageId}`,
      traceId: crypto.randomUUID(),
    });
  }
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
      res.writeHead(500);
      res.end();
    });
    return;
  }

  if (req.method === "POST") {
    handleInbound(req, res).catch((err) => {
      console.error("[whatsapp-worker] inbound processing error:", err);
      // Response was already sent (200) before this ran — this only logs,
      // matching the "ack fast, process after" contract above.
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
