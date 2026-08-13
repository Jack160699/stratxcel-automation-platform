import { loadEmailRuntimeConfig } from "../config.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";

export interface SupportEscalationEmailInput {
  handoffId: string;
  tenantId?: string | null;
  tenantLabel?: string;
  issueSummary: string;
  priority?: "low" | "normal" | "high" | "urgent";
  adminUrl?: string | null;
  /** Optional customer acknowledgement recipient. */
  customerRecipient?: string | null;
}

/**
 * Sends to configured SUPPORT_EMAIL when a genuine human-support escalation is created.
 * Never includes stack traces or secrets.
 */
export async function enqueueSupportEscalationEmail(
  store: EmailOutboxStore,
  input: SupportEscalationEmailInput
): Promise<EnqueueEmailResult[]> {
  const config = loadEmailRuntimeConfig();
  const results: EnqueueEmailResult[] = [];
  const priority = input.priority ?? "high";
  const safeSummary = input.issueSummary.slice(0, 500).replace(/[\r\n]+/g, " ");

  results.push(
    await enqueueTransactionalEmail(store, {
      eventType: "SUPPORT_ESCALATION_CREATED",
      recipient: config.supportEmail,
      idempotencyKey: `support_esc:${input.handoffId}`,
      tenantId: input.tenantId ?? null,
      correlationId: input.handoffId,
      allowMissingRecipient: false,
      payload: {
        tenantLabel: input.tenantLabel ?? input.tenantId ?? "n/a",
        issueSummary: safeSummary,
        referenceId: input.handoffId,
        priority,
        adminUrl: input.adminUrl ?? "",
      },
    })
  );

  if (input.customerRecipient) {
    results.push(
      await enqueueTransactionalEmail(store, {
        eventType: "IMPORTANT_ACCOUNT_NOTICE",
        recipient: input.customerRecipient,
        idempotencyKey: `support_esc_ack:${input.handoffId}`,
        tenantId: input.tenantId ?? null,
        correlationId: input.handoffId,
        payload: {
          noticeTitle: "We received your support request",
          noticeBody:
            "Our team has been notified and will follow up. Reference: " + input.handoffId,
        },
      })
    );
  }

  return results;
}

export async function enqueueSupportEscalationEmailBestEffort(
  store: EmailOutboxStore | null,
  input: SupportEscalationEmailInput
): Promise<void> {
  if (!store) return;
  try {
    await enqueueSupportEscalationEmail(store, input);
  } catch (err) {
    console.error("[Email Notifications] support escalation enqueue failed", err instanceof Error ? err.message : err);
  }
}
