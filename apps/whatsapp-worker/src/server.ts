import http from "node:http";
import { parseInboundWhatsAppWebhook, verifyWhatsAppWebhookSignature } from "@stratxcel/whatsapp";
import { createServiceClient as createCrmClient, createLead, findLeadByPhone } from "@stratxcel/leads-and-crm";
import { createServiceClient as createAuditClient, recordAuditEvent } from "@stratxcel/audit";
import { createLoggingMissionQueue } from "./queue.ts";

/**
 * Standalone Meta webhook receiver for WhatsApp — separated from the
 * Next.js dashboard app precisely so a slow/failing mission never blocks
 * Meta's webhook delivery (Meta expects a fast 200 and will disable the
 * webhook after repeated timeouts). This process does exactly three
 * things: verify, normalize, and hand off to the queue — it never calls
 * into @stratxcel/missions directly. apps/mission-worker owns execution.
 *
 * Not deployed anywhere yet. The Python/Flask bot in ai-automation-system
 * remains the production WhatsApp system and rollback target until this
 * is verified functionally equivalent and explicitly approved for cutover.
 */

const PORT = Number(process.env.PORT ?? 8081);

// No phone-number -> tenant mapping table exists yet (a real multi-tenant
// WhatsApp routing feature, not built in this phase) — every inbound
// message is attributed to this single tenant until that's added. Refusing
// to guess a tenant silently would make local/shadow testing impossible,
// so this is an explicit, loud requirement instead of a hidden default.
function requireDefaultTenantId(): string {
  const tenantId = process.env.WHATSAPP_WORKER_DEFAULT_TENANT_ID;
  if (!tenantId) {
    throw new Error(
      "WHATSAPP_WORKER_DEFAULT_TENANT_ID is not set — required until phone-number-to-tenant routing exists"
    );
  }
  return tenantId;
}

const missionQueue = createLoggingMissionQueue();

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

  if (!verifyWhatsAppWebhookSignature(rawBody, req.headers["x-hub-signature-256"] as string | undefined ?? null)) {
    res.writeHead(401);
    res.end("invalid signature");
    return;
  }

  // Acknowledge immediately — Meta only cares that we received it.
  // Processing continues after the response is sent.
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));

  const tenantId = requireDefaultTenantId();
  const crmClient = createCrmClient();
  const auditClient = createAuditClient();
  const messages = parseInboundWhatsAppWebhook(JSON.parse(rawBody));

  for (const message of messages) {
    let lead = await findLeadByPhone(crmClient, tenantId, message.from);
    if (!lead) {
      lead = await createLead(crmClient, { tenantId, source: "whatsapp", contactPhone: message.from });
    }

    await recordAuditEvent(auditClient, {
      tenantId,
      actorKind: "integration",
      action: "whatsapp.message_received",
      targetType: "crm_lead",
      targetId: lead.id,
      metadata: { providerMessageId: message.providerMessageId },
    });

    await missionQueue.submit({
      tenantId,
      goalText: message.body,
      leadId: lead.id,
      createdBy: null,
    });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

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
      // Response was already sent (200) before processing — this only
      // logs, matching the "ack fast, process after" contract above.
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
}

export { server };
