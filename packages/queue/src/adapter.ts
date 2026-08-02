import type { EnqueueJobInput, JobFailure, QueueJobRow } from "./types.ts";

/**
 * Provider-agnostic queue contract. Postgres is the only implementation
 * tonight (PostgresQueueAdapter) — this interface exists specifically so
 * mission/WhatsApp business logic depends only on QueueAdapter, never on
 * Postgres/Supabase directly, making a later swap to Redis/QStash/SQS/
 * Cloud Tasks/RabbitMQ a new adapter file, not a rewrite of call sites.
 */
export interface QueueAdapter {
  enqueue(input: EnqueueJobInput): Promise<QueueJobRow>;
  claimNext(input: { leaseOwner: string; jobTypes?: string[]; leaseSeconds?: number }): Promise<QueueJobRow | null>;
  heartbeat(input: { jobId: string; leaseOwner: string; leaseSeconds?: number }): Promise<QueueJobRow | null>;
  complete(input: { jobId: string; leaseOwner: string }): Promise<QueueJobRow | null>;
  fail(input: { jobId: string; leaseOwner: string; error: JobFailure }): Promise<QueueJobRow | null>;
  cancel(jobId: string): Promise<QueueJobRow | null>;
  recoverExpiredLeases(): Promise<QueueJobRow[]>;
  listDeadLetter(tenantId: string, limit?: number): Promise<QueueJobRow[]>;
  listForTenant(tenantId: string, limit?: number): Promise<QueueJobRow[]>;
}
