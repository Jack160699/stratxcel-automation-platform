import { enqueueTransactionalEmail } from "../outbox/enqueue.ts";
import type { EmailOutboxStore } from "../outbox/store.ts";
import type { EnqueueEmailResult } from "../types.ts";

export type MissionEmailFailureKind =
  | "FAILED_FINAL"
  | "RETRYING"
  | "WAITING_CONFIGURATION"
  | "WAITING_APPROVAL";

export interface MissionEmailInput {
  missionId: string;
  tenantId: string;
  recipient: string;
  missionTitle: string;
  summary?: string | null;
  ownerId?: string | null;
}

/**
 * Only terminal-success missions should call this.
 */
export async function enqueueMissionCompletedEmail(
  store: EmailOutboxStore,
  input: MissionEmailInput
): Promise<EnqueueEmailResult> {
  return enqueueTransactionalEmail(store, {
    eventType: "MISSION_COMPLETED",
    recipient: input.recipient,
    idempotencyKey: `mission_completed:${input.missionId}`,
    tenantId: input.tenantId,
    ownerId: input.ownerId ?? null,
    correlationId: input.missionId,
    payload: {
      missionTitle: input.missionTitle,
      missionId: input.missionId,
      summary: input.summary ?? "",
    },
  });
}

/**
 * Only final/customer-actionable failures. Transient retries must NOT call this.
 */
export async function enqueueMissionFailedEmail(
  store: EmailOutboxStore,
  input: MissionEmailInput & { failureKind: MissionEmailFailureKind; safeSummary?: string }
): Promise<EnqueueEmailResult> {
  if (input.failureKind !== "FAILED_FINAL") {
    return { enqueued: false, duplicate: false, reason: `skipped_non_final:${input.failureKind}` };
  }

  return enqueueTransactionalEmail(store, {
    eventType: "MISSION_FAILED",
    recipient: input.recipient,
    idempotencyKey: `mission_failed:${input.missionId}`,
    tenantId: input.tenantId,
    ownerId: input.ownerId ?? null,
    correlationId: input.missionId,
    payload: {
      missionTitle: input.missionTitle,
      missionId: input.missionId,
      failureKind: input.failureKind,
      safeSummary: input.safeSummary ?? input.summary ?? "",
    },
  });
}

export async function enqueueMissionTerminalEmailBestEffort(
  store: EmailOutboxStore | null,
  input: {
    state: string;
    missionId: string;
    tenantId: string;
    recipient: string | null;
    missionTitle: string;
    summary?: string | null;
    ownerId?: string | null;
    /** When true, the worker considers this a retryable Hermes failure — do not email. */
    retryableFailure?: boolean;
  }
): Promise<void> {
  if (!store || !input.recipient) return;
  try {
    if (input.state === "COMPLETED" || input.state === "PARTIALLY_COMPLETED") {
      await enqueueMissionCompletedEmail(store, {
        missionId: input.missionId,
        tenantId: input.tenantId,
        recipient: input.recipient,
        missionTitle: input.missionTitle,
        summary: input.summary,
        ownerId: input.ownerId,
      });
      return;
    }
    if (input.state === "FAILED") {
      if (input.retryableFailure) return;
      await enqueueMissionFailedEmail(store, {
        missionId: input.missionId,
        tenantId: input.tenantId,
        recipient: input.recipient,
        missionTitle: input.missionTitle,
        summary: input.summary,
        ownerId: input.ownerId,
        failureKind: "FAILED_FINAL",
        safeSummary: "The mission ended without completing. Open Stratxcel for details.",
      });
    }
  } catch (err) {
    console.error("[Email Notifications] mission enqueue failed", err instanceof Error ? err.message : err);
  }
}
