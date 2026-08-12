import type { ServiceClient } from "./db.ts";
import type { QueueAdapter } from "./adapter.ts";
import type { EnqueueJobInput, QueueJobRow } from "./types.ts";

/**
 * All claim/lease/completion mutations go through the queue_internal.*
 * SQL functions (supabase.rpc), never direct table UPDATEs from this
 * client code -- the transactional FOR UPDATE SKIP LOCKED claim in
 * particular cannot be expressed safely as a sequence of separate
 * select-then-update calls from the client; it must happen inside one
 * Postgres statement. Those functions are only executable by service_role
 * (see supabase/migrations/20260803130000_queue.sql), which is exactly the
 * client this adapter is constructed with.
 */

/**
 * Job types whose idempotency key represents a permanent, one-time logical
 * event rather than a recurring one. For these, a unique-violation on
 * (tenant_id, job_type, idempotency_key) can legitimately point at a
 * TERMINAL row (see 20260808270000_whatsapp_queue_terminal_idempotency.sql
 * for whatsapp.process_inbound), not just an in-flight one, so the lookup
 * below must not filter by status. Every other job type keeps the original
 * active-only lookup, matching queue_jobs_tenant_idempotency_active_idx.
 */
const TERMINAL_SAFE_IDEMPOTENT_JOB_TYPES = new Set([
  "whatsapp.process_inbound",
  "audit.generate_v1",
]);

export function createPostgresQueueAdapter(supabase: ServiceClient): QueueAdapter {
  return {
    async enqueue(input: EnqueueJobInput): Promise<QueueJobRow> {
      const { data, error } = await supabase
        .from("queue_jobs")
        .insert({
          tenant_id: input.tenantId,
          job_type: input.jobType,
          payload: input.payload ?? {},
          idempotency_key: input.idempotencyKey ?? null,
          priority: input.priority ?? 100,
          scheduled_at: (input.scheduledAt ?? new Date()).toISOString(),
          max_attempts: input.maxAttempts ?? 5,
          trace_id: input.traceId ?? null,
          correlation_id: input.correlationId ?? null,
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505" && input.idempotencyKey) {
          if (TERMINAL_SAFE_IDEMPOTENT_JOB_TYPES.has(input.jobType)) {
            // whatsapp.process_inbound (and any future job type added to
            // TERMINAL_SAFE_IDEMPOTENT_JOB_TYPES) is permanently deduped at
            // the DB level regardless of status -- a redelivery of the same
            // provider message ID must resolve back to the SAME logical job
            // even if it already reached SUCCEEDED/FAILED/DEAD_LETTER/
            // CANCELLED, never create a second row. Scoped to this exact
            // tenant + job_type + idempotency_key so it can never return
            // another tenant's or another job type's row.
            const existing = await supabase
              .from("queue_jobs")
              .select("*")
              .eq("tenant_id", input.tenantId)
              .eq("job_type", input.jobType)
              .eq("idempotency_key", input.idempotencyKey)
              .maybeSingle();
            if (existing.data) return existing.data as QueueJobRow;
          } else {
            // A duplicate active idempotency key is not an error condition
            // for the caller -- it means the in-flight job is already doing
            // the work, so return that existing job instead of throwing.
            // Terminal jobs are deliberately excluded here: for these job
            // types the same key can be legitimately reused for a later,
            // genuinely new occurrence of the same logical event once the
            // prior one has finished.
            const existing = await supabase
              .from("queue_jobs")
              .select("*")
              .eq("tenant_id", input.tenantId)
              .eq("idempotency_key", input.idempotencyKey)
              .not("status", "in", "(SUCCEEDED,FAILED,DEAD_LETTER,CANCELLED)")
              .maybeSingle();
            if (existing.data) return existing.data as QueueJobRow;
          }
        }
        throw new Error(`enqueue: ${error.message}`);
      }
      return data as QueueJobRow;
    },

    async claimNext(input) {
      const { data, error } = await supabase.rpc("claim_next_job", {
        p_lease_owner: input.leaseOwner,
        p_job_types: input.jobTypes ?? null,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
      if (error) throw new Error(`claimNext: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },

    async heartbeat(input) {
      const { data, error } = await supabase.rpc("heartbeat_job", {
        p_job_id: input.jobId,
        p_lease_owner: input.leaseOwner,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
      if (error) throw new Error(`heartbeat: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },

    async complete(input) {
      const { data, error } = await supabase.rpc("complete_job", {
        p_job_id: input.jobId,
        p_lease_owner: input.leaseOwner,
      });
      if (error) throw new Error(`complete: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },

    async fail(input) {
      const { data, error } = await supabase.rpc("fail_job", {
        p_job_id: input.jobId,
        p_lease_owner: input.leaseOwner,
        p_error: input.error,
        p_retryable: input.error.retryable,
      });
      if (error) throw new Error(`fail: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },

    async cancel(jobId: string) {
      const { data, error } = await supabase.rpc("cancel_job", { p_job_id: jobId });
      if (error) throw new Error(`cancel: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },

    async recoverExpiredLeases() {
      const { data, error } = await supabase.rpc("recover_expired_leases");
      if (error) throw new Error(`recoverExpiredLeases: ${error.message}`);
      return (data ?? []) as QueueJobRow[];
    },

    async listDeadLetter(tenantId: string, limit = 50) {
      const { data, error } = await supabase
        .from("queue_jobs")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "DEAD_LETTER")
        .order("completed_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`listDeadLetter: ${error.message}`);
      return (data ?? []) as QueueJobRow[];
    },

    async listForTenant(tenantId: string, limit = 100) {
      const { data, error } = await supabase
        .from("queue_jobs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`listForTenant: ${error.message}`);
      return (data ?? []) as QueueJobRow[];
    },

    async requeueDeadLetter(input) {
      const { data, error } = await supabase.rpc("requeue_dead_letter_job", {
        p_job_id: input.jobId,
        p_tenant_id: input.tenantId,
      });
      if (error) throw new Error(`requeueDeadLetter: ${error.message}`);
      const rows = (data ?? []) as QueueJobRow[];
      return rows[0] ?? null;
    },
  };
}
