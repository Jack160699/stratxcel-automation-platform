import type { EmailOutboxRow, EmailOutboxStatus, EmailEventType } from "../types.ts";

export interface InsertOutboxInput {
  tenantId?: string | null;
  ownerId?: string | null;
  eventType: EmailEventType;
  recipient: string;
  recipientHash: string;
  templateKey: string;
  templateVersion: number;
  subject: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
  status?: EmailOutboxStatus;
}

export interface ClaimOutboxOptions {
  limit?: number;
  leaseOwner: string;
  now?: Date;
}

export interface EmailOutboxStore {
  insert(input: InsertOutboxInput): Promise<{ row: EmailOutboxRow; duplicate: boolean }>;
  claimPending(options: ClaimOutboxOptions): Promise<EmailOutboxRow[]>;
  markSent(
    id: string,
    data: { provider: string; providerMessageId: string; attemptCount: number }
  ): Promise<EmailOutboxRow>;
  markRetry(
    id: string,
    data: {
      attemptCount: number;
      nextAttemptAt: string;
      errorCode: string;
      errorSafe: string;
    }
  ): Promise<EmailOutboxRow>;
  markFailed(
    id: string,
    data: {
      attemptCount: number;
      errorCode: string;
      errorSafe: string;
      status?: "FAILED" | "WAITING_CONFIGURATION" | "CANCELLED";
    }
  ): Promise<EmailOutboxRow>;
  getById(id: string): Promise<EmailOutboxRow | null>;
  listByTenant(tenantId: string): Promise<EmailOutboxRow[]>;
  /** Optional connectivity probe for System Health. */
  ping?(): Promise<boolean>;
}

export function nowIso(d = new Date()): string {
  return d.toISOString();
}
