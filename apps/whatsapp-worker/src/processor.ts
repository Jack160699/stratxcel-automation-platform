import os from "node:os";
import { createServiceClient as createQueueClient, createPostgresQueueAdapter } from "@stratxcel/queue";
import { createServiceClient as createWhatsAppClient, processInboundMessage, type ParsedInboundWhatsAppMessage } from "@stratxcel/whatsapp";

/**
 * The async half of the WhatsApp pipeline: claims 'whatsapp.process_inbound'
 * jobs enqueued by server.ts and runs the actual conversation logic
 * (@stratxcel/whatsapp's processInboundMessage) — kept in a separate
 * process/loop from the webhook receiver so a slow conversation step can
 * never delay Meta's webhook ack.
 */

const POLL_INTERVAL_MS = Number(process.env.WHATSAPP_PROCESSOR_POLL_INTERVAL_MS ?? 3000);
const LEASE_OWNER = `whatsapp-processor-${os.hostname()}-${process.pid}`;
const JOB_TYPE = "whatsapp.process_inbound";

export async function processOnce(
  queue: ReturnType<typeof createPostgresQueueAdapter>,
  whatsappClient: ReturnType<typeof createWhatsAppClient>
): Promise<boolean> {
  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes: [JOB_TYPE] });
  if (!job) return false;

  try {
    const message = (job.payload as { message: ParsedInboundWhatsAppMessage }).message;
    await processInboundMessage(whatsappClient, { tenantId: job.tenant_id, message });
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

if (process.env.NODE_ENV !== "test") {
  const queueClient = createQueueClient();
  const queue = createPostgresQueueAdapter(queueClient);
  const whatsappClient = createWhatsAppClient();

  console.log(`[whatsapp-processor] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}`);
  setInterval(() => {
    processOnce(queue, whatsappClient).catch((err) => {
      console.error("[whatsapp-processor] poll cycle failed:", err);
    });
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[whatsapp-processor] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
