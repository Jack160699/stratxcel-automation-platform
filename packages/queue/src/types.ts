export type QueueJobStatus =
  | "PENDING"
  | "LEASED"
  | "RETRY_SCHEDULED"
  | "SUCCEEDED"
  | "FAILED"
  | "DEAD_LETTER"
  | "CANCELLED";

export interface QueueJobRow {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  priority: number;
  scheduled_at: string;
  status: QueueJobStatus;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  last_error: Record<string, unknown> | null;
  trace_id: string | null;
  correlation_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface EnqueueJobInput {
  tenantId: string;
  jobType: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  scheduledAt?: Date;
  maxAttempts?: number;
  traceId?: string;
  correlationId?: string;
}

export interface JobFailure {
  message: string;
  code?: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
