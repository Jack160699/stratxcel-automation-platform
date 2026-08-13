import { loadEmailRuntimeConfig } from "../config.ts";
import { getEmailEventContract } from "../events.ts";
import { emitEmailOperationalEvent } from "../observability.ts";
import { validateRecipient } from "../recipient.ts";
import { renderEmailTemplate } from "../templates/render.ts";
import type { EnqueueEmailInput, EnqueueEmailResult } from "../types.ts";
import type { EmailOutboxStore } from "./store.ts";

/**
 * Canonical enqueue path: domain event → typed contract → template render →
 * recipient validation → durable outbox insert with idempotency.
 *
 * Does NOT call the provider. Provider send happens in the outbox processor.
 */
export async function enqueueTransactionalEmail(
  store: EmailOutboxStore,
  input: EnqueueEmailInput
): Promise<EnqueueEmailResult> {
  const contract = getEmailEventContract(input.eventType);
  const config = loadEmailRuntimeConfig();

  if (contract.tenantRequired && !input.tenantId) {
    return { enqueued: false, duplicate: false, reason: "tenant_required" };
  }

  for (const key of contract.requiredPayloadKeys) {
    if (input.payload[key] == null || input.payload[key] === "") {
      return { enqueued: false, duplicate: false, reason: `missing_payload:${key}` };
    }
  }

  const recipient = validateRecipient(input.recipient, {
    allowTestRecipients: config.testMode,
  });
  if (!recipient.ok) {
    if (input.allowMissingRecipient || recipient.reason === "empty") {
      return { enqueued: false, duplicate: false, reason: `invalid_recipient:${recipient.reason}` };
    }
    return { enqueued: false, duplicate: false, reason: `invalid_recipient:${recipient.reason}` };
  }

  let rendered;
  try {
    rendered = renderEmailTemplate(input.eventType, input.payload, {
      supportEmail: config.supportEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("HEADER_INJECTION:")) {
      return { enqueued: false, duplicate: false, reason: "header_injection" };
    }
    throw err;
  }

  // Persist only safe template payload (no secrets). Subject is rendered separately.
  const safePayload: Record<string, unknown> = {
    ...input.payload,
    _rendered: {
      preheader: rendered.preheader,
      html: rendered.html,
      text: rendered.text,
    },
  };

  const { row, duplicate } = await store.insert({
    tenantId: input.tenantId ?? null,
    ownerId: input.ownerId ?? null,
    eventType: input.eventType,
    recipient: recipient.normalized,
    recipientHash: recipient.hash,
    templateKey: rendered.templateKey,
    templateVersion: rendered.templateVersion,
    subject: rendered.subject,
    payload: safePayload,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId ?? null,
  });

  if (!duplicate) {
    emitEmailOperationalEvent({
      event: "email_enqueued",
      eventType: input.eventType,
      templateKey: rendered.templateKey,
      tenantId: input.tenantId ?? null,
      correlationId: input.correlationId ?? null,
      outboxId: row.id,
      status: row.status,
    });
  }

  return {
    enqueued: !duplicate,
    duplicate,
    outboxId: row.id,
    reason: duplicate ? "idempotent_duplicate" : undefined,
  };
}
