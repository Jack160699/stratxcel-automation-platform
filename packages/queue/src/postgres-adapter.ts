import type { ServiceClient } from "./db.ts";
import type { QueueAdapter } from "./adapter.ts";
import type { EnqueueJobInput, QueueJobRow } from "./types.ts";

/**
 * All claim/lease/completion mutations go through the queue_internal.*
 * SQL functions (supabase.rpc), never direct table UPDATEs from this
 * client code — the transactional FOR UPDATE SKIP LOCKED claim in
 * particular cannot be expressed safely as a sequence of separate
 * select-then-update calls from the client; it must happen inside one
 * Postgres statement. Those functions are only executable by service_role
 * (see supabase/migrations/20260803130000_queue.sql), which is exactly the
 * client this adapter is constructed with.
 */
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
        // A duplicate active idempotency key is not an error condition for
        // the caller — it means the in-flight job is already doing the
        // work, so return that existing job instead of throwing.
        if (error.code === "23505" && input.idempotencyKey) {
          const existing = await supabase
            .from("queue_jobs")
            .select("*")
            .eq("tenant_id", input.tenantId)
            .eq("idempotency_key", input.idempotencyKey)
            .not("status", "in", "(SUCCEEDED,FAILED,DEAD_LETTER,CANCELLED)")
            .maybeSingle();
          if (existing.data) return existing.data as QueueJobRow;
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
