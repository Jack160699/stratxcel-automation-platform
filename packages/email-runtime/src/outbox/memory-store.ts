import { randomUUID } from "node:crypto";
import type { EmailOutboxRow } from "../types.ts";
import type { ClaimOutboxOptions, EmailOutboxStore, InsertOutboxInput } from "./store.ts";
import { nowIso } from "./store.ts";

/**
 * In-memory durable-enough outbox for unit tests (survives within-process worker restarts).
 */
export class InMemoryEmailOutboxStore implements EmailOutboxStore {
  readonly rows = new Map<string, EmailOutboxRow>();
  private readonly idempotency = new Map<string, string>();

  private key(eventType: string, idempotencyKey: string, recipient: string): string {
    return `${eventType}::${idempotencyKey}::${recipient.toLowerCase()}`;
  }

  async insert(input: InsertOutboxInput): Promise<{ row: EmailOutboxRow; duplicate: boolean }> {
    const ik = this.key(input.eventType, input.idempotencyKey, input.recipient);
    const existingId = this.idempotency.get(ik);
    if (existingId) {
      const existing = this.rows.get(existingId)!;
      return { row: existing, duplicate: true };
    }

    const id = randomUUID();
    const ts = nowIso();
    const row: EmailOutboxRow = {
      id,
      tenant_id: input.tenantId ?? null,
      owner_id: input.ownerId ?? null,
      event_type: input.eventType,
      recipient: input.recipient,
      recipient_hash: input.recipientHash,
      template_key: input.templateKey,
      template_version: input.templateVersion,
      subject: input.subject,
      payload: input.payload,
      idempotency_key: input.idempotencyKey,
      provider: null,
      provider_message_id: null,
      status: input.status ?? "PENDING",
      attempt_count: 0,
      next_attempt_at: ts,
      last_attempt_at: null,
      last_error_code: null,
      last_error_safe: null,
      sent_at: null,
      correlation_id: input.correlationId ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.rows.set(id, row);
    this.idempotency.set(ik, id);
    return { row, duplicate: false };
  }

  async claimPending(options: ClaimOutboxOptions): Promise<EmailOutboxRow[]> {
    const limit = options.limit ?? 10;
    const now = options.now ?? new Date();
    const claimed: EmailOutboxRow[] = [];

    const candidates = [...this.rows.values()]
      .filter((r) => {
        if (r.status === "PENDING" || r.status === "RETRY_WAIT") {
          return new Date(r.next_attempt_at).getTime() <= now.getTime();
        }
        // Recover stale PROCESSING leases (>5 min) — simulates worker restart safety.
        if (r.status === "PROCESSING" && r.last_attempt_at) {
          return now.getTime() - new Date(r.last_attempt_at).getTime() > 5 * 60 * 1000;
        }
        return false;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const row of candidates.slice(0, limit)) {
      const updated: EmailOutboxRow = {
        ...row,
        status: "PROCESSING",
        last_attempt_at: nowIso(now),
        updated_at: nowIso(now),
      };
      this.rows.set(row.id, updated);
      claimed.push(updated);
    }
    return claimed;
  }

  async markSent(
    id: string,
    data: { provider: string; providerMessageId: string; attemptCount: number }
  ): Promise<EmailOutboxRow> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`outbox row not found: ${id}`);
    if (row.status === "SENT" && row.provider_message_id) return row;
    const ts = nowIso();
    const updated: EmailOutboxRow = {
      ...row,
      status: "SENT",
      provider: data.provider,
      provider_message_id: data.providerMessageId,
      attempt_count: data.attemptCount,
      sent_at: ts,
      updated_at: ts,
      last_attempt_at: ts,
      last_error_code: null,
      last_error_safe: null,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async markRetry(
    id: string,
    data: {
      attemptCount: number;
      nextAttemptAt: string;
      errorCode: string;
      errorSafe: string;
    }
  ): Promise<EmailOutboxRow> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`outbox row not found: ${id}`);
    const ts = nowIso();
    const updated: EmailOutboxRow = {
      ...row,
      status: "RETRY_WAIT",
      attempt_count: data.attemptCount,
      next_attempt_at: data.nextAttemptAt,
      last_error_code: data.errorCode,
      last_error_safe: data.errorSafe,
      last_attempt_at: ts,
      updated_at: ts,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async markFailed(
    id: string,
    data: {
      attemptCount: number;
      errorCode: string;
      errorSafe: string;
      status?: "FAILED" | "WAITING_CONFIGURATION" | "CANCELLED";
    }
  ): Promise<EmailOutboxRow> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`outbox row not found: ${id}`);
    const ts = nowIso();
    const updated: EmailOutboxRow = {
      ...row,
      status: data.status ?? "FAILED",
      attempt_count: data.attemptCount,
      last_error_code: data.errorCode,
      last_error_safe: data.errorSafe,
      last_attempt_at: ts,
      updated_at: ts,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async getById(id: string): Promise<EmailOutboxRow | null> {
    return this.rows.get(id) ?? null;
  }

  async listByTenant(tenantId: string): Promise<EmailOutboxRow[]> {
    return [...this.rows.values()].filter((r) => r.tenant_id === tenantId);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
