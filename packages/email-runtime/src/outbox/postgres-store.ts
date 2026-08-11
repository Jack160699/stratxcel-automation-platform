import type { ServiceClient } from "../db.ts";
import type { EmailOutboxRow } from "../types.ts";
import type { ClaimOutboxOptions, EmailOutboxStore, InsertOutboxInput } from "./store.ts";

function mapRow(data: Record<string, unknown>): EmailOutboxRow {
  return data as unknown as EmailOutboxRow;
}

/**
 * Postgres-backed durable outbox. Writes require service-role context.
 * Idempotency is enforced by unique (event_type, idempotency_key, recipient).
 */
export class PostgresEmailOutboxStore implements EmailOutboxStore {
  private readonly supabase: ServiceClient;

  constructor(supabase: ServiceClient) {
    this.supabase = supabase;
  }

  async insert(input: InsertOutboxInput): Promise<{ row: EmailOutboxRow; duplicate: boolean }> {
    const { data, error } = await this.supabase
      .from("email_outbox")
      .insert({
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
        correlation_id: input.correlationId ?? null,
        status: input.status ?? "PENDING",
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing, error: lookupErr } = await this.supabase
          .from("email_outbox")
          .select("*")
          .eq("event_type", input.eventType)
          .eq("idempotency_key", input.idempotencyKey)
          .eq("recipient", input.recipient)
          .maybeSingle();
        if (lookupErr) throw new Error(`email_outbox duplicate lookup failed: ${lookupErr.message}`);
        if (!existing) throw new Error("email_outbox unique conflict but row not found");
        return { row: mapRow(existing), duplicate: true };
      }
      throw new Error(`email_outbox insert failed: ${error.message}`);
    }

    return { row: mapRow(data), duplicate: false };
  }

  async claimPending(options: ClaimOutboxOptions): Promise<EmailOutboxRow[]> {
    const { data, error } = await this.supabase.rpc("claim_email_outbox_batch", {
      p_limit: options.limit ?? 10,
      p_lease_owner: options.leaseOwner,
    });
    if (error) throw new Error(`claim_email_outbox_batch failed: ${error.message}`);
    return Array.isArray(data) ? data.map((r) => mapRow(r as Record<string, unknown>)) : [];
  }

  async markSent(
    id: string,
    data: { provider: string; providerMessageId: string; attemptCount: number }
  ): Promise<EmailOutboxRow> {
    const ts = new Date().toISOString();
    const { data: row, error } = await this.supabase
      .from("email_outbox")
      .update({
        status: "SENT",
        provider: data.provider,
        provider_message_id: data.providerMessageId,
        attempt_count: data.attemptCount,
        sent_at: ts,
        last_attempt_at: ts,
        last_error_code: null,
        last_error_safe: null,
        updated_at: ts,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`email_outbox markSent failed: ${error.message}`);
    return mapRow(row);
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
    const ts = new Date().toISOString();
    const { data: row, error } = await this.supabase
      .from("email_outbox")
      .update({
        status: "RETRY_WAIT",
        attempt_count: data.attemptCount,
        next_attempt_at: data.nextAttemptAt,
        last_error_code: data.errorCode,
        last_error_safe: data.errorSafe,
        last_attempt_at: ts,
        updated_at: ts,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`email_outbox markRetry failed: ${error.message}`);
    return mapRow(row);
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
    const ts = new Date().toISOString();
    const { data: row, error } = await this.supabase
      .from("email_outbox")
      .update({
        status: data.status ?? "FAILED",
        attempt_count: data.attemptCount,
        last_error_code: data.errorCode,
        last_error_safe: data.errorSafe,
        last_attempt_at: ts,
        updated_at: ts,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`email_outbox markFailed failed: ${error.message}`);
    return mapRow(row);
  }

  async getById(id: string): Promise<EmailOutboxRow | null> {
    const { data, error } = await this.supabase.from("email_outbox").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`email_outbox getById failed: ${error.message}`);
    return data ? mapRow(data) : null;
  }

  async listByTenant(tenantId: string): Promise<EmailOutboxRow[]> {
    const { data, error } = await this.supabase
      .from("email_outbox")
      .select("id, tenant_id, event_type, template_key, status, attempt_count, created_at, sent_at, last_error_code")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`email_outbox listByTenant failed: ${error.message}`);
    return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  }

  async ping(): Promise<boolean> {
    const { error } = await this.supabase.from("email_outbox").select("id").limit(1);
    return !error;
  }
}

export function createPostgresEmailOutboxStore(supabase: ServiceClient): PostgresEmailOutboxStore {
  return new PostgresEmailOutboxStore(supabase);
}
