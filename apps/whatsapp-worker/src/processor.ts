import http from "node:http";
import os from "node:os";
import { createServiceClient as createQueueClient, createPostgresQueueAdapter, isKillSwitchActive, recordWorkerHeartbeat, getWorkerHealth } from "@stratxcel/queue";
import { createServiceClient as createWhatsAppClient, processInboundMessage, type ParsedInboundWhatsAppMessage } from "@stratxcel/whatsapp";

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
    await processInboundMessage(whatsappClient, { tenantId: job.tenant_id, message, phoneBindingId });
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
