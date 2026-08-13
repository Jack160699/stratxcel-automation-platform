import type { ServiceClient } from "./db.ts";

export type WorkerType = "mission-worker" | "whatsapp-worker" | "hermes-gateway" | "package-autopilot-worker" | "email-processor";
export type WorkerStatus = "idle" | "busy" | "degraded" | "stopped";

export interface WorkerHeartbeatInput {
  workerType: WorkerType;
  instanceId: string;
  status: WorkerStatus;
  version?: string | null;
  queueBacklogHint?: number | null;
  lastError?: Record<string, unknown> | null;
}

/** Upserted every poll cycle — one row per running process, identified by (workerType, instanceId). */
export async function recordWorkerHeartbeat(supabase: ServiceClient, input: WorkerHeartbeatInput): Promise<void> {
  const { error } = await supabase.from("worker_heartbeats").upsert(
    {
      worker_type: input.workerType,
      instance_id: input.instanceId,
      status: input.status,
      version: input.version ?? null,
      queue_backlog_hint: input.queueBacklogHint ?? null,
      last_error: input.lastError ?? null,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "worker_type,instance_id" }
  );
  if (error) throw new Error(`recordWorkerHeartbeat: ${error.message}`);
}

export interface WorkerHealthReport {
  status: "healthy" | "degraded" | "unavailable";
  workerType: WorkerType;
  instances: Array<{
    instanceId: string;
    status: WorkerStatus;
    lastHeartbeatAt: string;
    staleForSeconds: number;
    version: string | null;
    queueBacklogHint: number | null;
    lastError: Record<string, unknown> | null;
  }>;
  reason?: string;
}

const STALE_AFTER_SECONDS = 90; // 3x a typical 30s heartbeat interval before we call an instance stale

/**
 * What GET /health actually reports — never "healthy" purely because the
 * HTTP process answered. An instance whose own last heartbeat write is
 * stale, or that self-reported "degraded", pulls the whole worker_type's
 * status down; no live instances at all is "unavailable", not "healthy with
 * zero workers."
 */
export async function getWorkerHealth(supabase: ServiceClient, workerType: WorkerType): Promise<WorkerHealthReport> {
  const { data, error } = await supabase
    .from("worker_heartbeats")
    .select("*")
    .eq("worker_type", workerType)
    .order("last_heartbeat_at", { ascending: false })
    .limit(20);

  if (error) {
    return { status: "unavailable", workerType, instances: [], reason: `database unreachable: ${error.message}` };
  }

  const now = Date.now();
  const instances = (data ?? []).map((row) => ({
    instanceId: row.instance_id as string,
    status: row.status as WorkerStatus,
    lastHeartbeatAt: row.last_heartbeat_at as string,
    staleForSeconds: Math.max(0, Math.floor((now - new Date(row.last_heartbeat_at as string).getTime()) / 1000)),
    version: (row.version as string) ?? null,
    queueBacklogHint: (row.queue_backlog_hint as number) ?? null,
    lastError: (row.last_error as Record<string, unknown>) ?? null,
  }));

  if (instances.length === 0) {
    return { status: "unavailable", workerType, instances, reason: "no worker instance has ever reported a heartbeat" };
  }

  const live = instances.filter((i) => i.staleForSeconds < STALE_AFTER_SECONDS);
  if (live.length === 0) {
    return { status: "unavailable", workerType, instances, reason: "every known instance's heartbeat is stale" };
  }
  if (live.some((i) => i.status === "degraded" || i.status === "stopped")) {
    return { status: "degraded", workerType, instances, reason: "at least one live instance self-reported degraded/stopped" };
  }

  return { status: "healthy", workerType, instances };
}
