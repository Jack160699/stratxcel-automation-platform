import { heartbeatState } from "../hermes/mission-control.ts";

/**
 * Whether the email outbox processor path is proven healthy for System Health.
 * Reuses Hermes heartbeatState — fresh degraded/offline/unavailable is never healthy.
 * Fail closed on heartbeat query errors.
 */
export function resolveEmailProcessorPathAvailable(input: {
  lastHeartbeatAt?: string | null;
  heartbeatStatus?: string | null;
  heartbeatQueryFailed?: boolean;
  processorMode?: string | null;
}): boolean {
  if (input.heartbeatQueryFailed) return false;

  const last = input.lastHeartbeatAt ?? null;
  if (last) {
    const reported = (input.heartbeatStatus ?? "").trim().toLowerCase();
    // Explicit unhealthy worker statuses must never count as a healthy processor path,
    // even if the timestamp is fresh (heartbeatState treats unknown statuses as healthy).
    if (reported === "degraded" || reported === "stopped" || reported === "unavailable") {
      return false;
    }
    return heartbeatState(last, input.heartbeatStatus ?? undefined) === "healthy";
  }

  const mode = (input.processorMode ?? "").trim().toLowerCase();
  // Explicit supported external scheduler without heartbeat telemetry.
  return mode === "http-manual-with-external-scheduler";
}
