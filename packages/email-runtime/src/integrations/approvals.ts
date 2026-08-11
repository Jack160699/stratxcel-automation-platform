import { loadEmailRuntimeConfig } from "../config.ts";
import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";
import { appApprovalsUrl } from "./payments.ts";

export interface ApprovalEmailInput {
  approvalId: string;
  tenantId: string;
  recipient: string;
  businessName: string;
  missionTitle: string;
  approvalSummary: string;
  expiresAt?: string | null;
  ownerId?: string | null;
}

/**
 * Enqueue APPROVAL_REQUIRED after a real approval row exists.
 * Does not imply any action was executed.
 */
export async function enqueueApprovalRequiredEmail(
  store: EmailOutboxStore,
  input: ApprovalEmailInput
): Promise<EnqueueEmailResult> {
  return enqueueTransactionalEmail(store, {
    eventType: "APPROVAL_REQUIRED",
    recipient: input.recipient,
    idempotencyKey: `approval_required:${input.approvalId}`,
    tenantId: input.tenantId,
    ownerId: input.ownerId ?? null,
    correlationId: input.approvalId,
    payload: {
      businessName: input.businessName,
      missionTitle: input.missionTitle,
      approvalSummary: input.approvalSummary,
      approvalUrl: appApprovalsUrl(input.tenantId, input.approvalId),
      expiresAt: input.expiresAt ?? "",
    },
  });
}

export async function enqueueApprovalRequiredEmailBestEffort(
  store: EmailOutboxStore | null,
  input: ApprovalEmailInput
): Promise<void> {
  if (!store) return;
  try {
    await enqueueApprovalRequiredEmail(store, input);
  } catch (err) {
    console.error("[Email Notifications] approval enqueue failed", err instanceof Error ? err.message : err);
  }
}

export function supportMailbox(): string {
  return loadEmailRuntimeConfig().supportEmail;
}
