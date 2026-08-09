import http from "node:http";
import os from "node:os";
import {
  createServiceClient,
  getMission,
  transitionMission,
  appendMissionEvent,
  getRequiredEntitlementMetric,
  recordHermesRunId,
  type MissionRow,
} from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import {
  createPostgresQueueAdapter,
  isKillSwitchActive,
  recordWorkerHeartbeat,
  getWorkerHealth,
  type QueueAdapter,
} from "@stratxcel/queue";
import { hasEntitlement, type EntitlementMetric } from "@stratxcel/payments-and-wallet";
import {
  compileMissionContext,
  issueMissionToken,
  selectHermesAdapter,
  isRetryableHermesFailure,
  type HermesRuntimeAdapter,
} from "@stratxcel/hermes";

/**
 * Standalone async mission executor — separated from the Next.js dashboard
 * so a long Hermes run never runs inside a Vercel request lifecycle
 * (master brief rule: "Long missions must be asynchronous"). Claims
 * 'mission.execute' jobs from the shared Postgres queue, moves the mission
 * to RUNNING, compiles a restricted mission-scoped context (Brand Brain at
 * the exact version the mission was estimated against, service
 * definition, budget ceiling), issues a short-lived mission token scoped
 * to that mission's allowed tools, and hands all three to the selected
 * HermesRuntimeAdapter (disabled by default; 'mock' or 'http' via
 * HERMES_MODE).
 */

const POLL_INTERVAL_MS = Number(process.env.MISSION_WORKER_POLL_INTERVAL_MS ?? 5000);
const LEASE_SECONDS = Number(process.env.MISSION_WORKER_LEASE_SECONDS ?? 300);
const HEARTBEAT_DURING_EXECUTE_MS = Math.max(5000, Math.floor((LEASE_SECONDS * 1000) / 3));
const WORKER_TYPE = "mission-worker" as const;
const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
const LEASE_OWNER = `${WORKER_TYPE}-${INSTANCE_ID}`;
const JOB_TYPE = "mission.execute";
const VERSION = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const PORT = Number(process.env.PORT ?? 8083);

const OUTCOME_TO_STATE = {
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  FAILED: "FAILED",
  AWAITING_INPUT: "AWAITING_INPUT",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
  // A disabled/unconfigured Hermes runtime (or a Hermes run that hits an
  // unresolvable blocker) is a truthful BLOCKED state, not a silent no-op or
  // a crash — BLOCKED can resume back to QUEUED once whatever blocked it
  // clears (see packages/missions/src/state-machine.ts). Missing this case
  // meant every mission run under the default (disabled) Hermes adapter
  // threw trying to transition to `undefined` — fixed here.
  BLOCKED: "BLOCKED",
} as const;

/**
 * Runs `hermes.execute()` while renewing the queue job's lease on a timer —
 * without this, a Hermes run longer than the lease (default 300s) would let
 * a *different* worker instance reclaim and double-execute the same job the
 * moment the lease expires, even though this instance is still working on
 * it. Heartbeat failures are logged, never thrown — a transient heartbeat
 * miss must not abort real in-progress work; the lease will still expire
 * and recover normally if this instance really has died.
 */
async function executeWithLeaseHeartbeat<T>(
  queue: QueueAdapter,
  jobId: string,
  run: () => Promise<T>
): Promise<T> {
  const interval = setInterval(() => {
    queue.heartbeat({ jobId, leaseOwner: LEASE_OWNER, leaseSeconds: LEASE_SECONDS }).catch((err) => {
      console.error(`[mission-worker] lease heartbeat failed for job ${jobId}:`, err);
    });
  }, HEARTBEAT_DURING_EXECUTE_MS);
  try {
    return await run();
  } finally {
    clearInterval(interval);
  }
}

async function executeMission(
  supabase: ReturnType<typeof createServiceClient>,
  queue: QueueAdapter,
  jobId: string,
  hermes: HermesRuntimeAdapter,
  mission: MissionRow
): Promise<void> {
  // Entitlement gate — fails/holds truthfully, never executes anyway. See
  // packages/missions/src/entitlement-map.ts for why this map is empty
  // tonight (no service is currently subscription-metered).
  const requiredMetric = getRequiredEntitlementMetric(mission.service_key);
  if (requiredMetric) {
    const entitled = await hasEntitlement(supabase, mission.tenant_id, requiredMetric as EntitlementMetric, 1);
    if (!entitled) {
      await transitionMission(supabase, { missionId: mission.id, nextState: "BLOCKED" });
      await appendMissionEvent(supabase, {
        missionId: mission.id,
        eventType: "entitlement_denied",
        payload: { metric: requiredMetric },
      });
      return;
    }
  }

  const running = await transitionMission(supabase, { missionId: mission.id, nextState: "RUNNING" });

  try {
    const context = await compileMissionContext(supabase, running);
    const missionToken = issueMissionToken({
      missionId: running.id,
      tenantId: running.tenant_id,
      allowedTools: context.allowedTools,
    });

    const result = await executeWithLeaseHeartbeat(queue, jobId, () => hermes.execute(running, context, missionToken));

    if (result.hermesRunId) {
      // Best-effort — see recordHermesRunId's doc comment. Never blocks or
      // fails the mission's own state transition below.
      await recordHermesRunId(supabase, mission.id, result.hermesRunId).catch((err) => {
        console.error(`[mission-worker] failed to record hermesRunId for mission ${mission.id}:`, err);
      });
    }

    await transitionMission(supabase, {
      missionId: mission.id,
      nextState: OUTCOME_TO_STATE[result.outcome],
      payload: { summary: result.summary },
    });

    for (const event of result.progressEvents ?? []) {
      await appendMissionEvent(supabase, { missionId: mission.id, eventType: "hermes_progress", payload: { ...event } });
    }
  } catch (err) {
    await appendMissionEvent(supabase, {
      missionId: mission.id,
      eventType: "execution_error",
      payload: { message: err instanceof Error ? err.message : String(err), retryable: isRetryableHermesFailure(err) },
    });
    await transitionMission(supabase, { missionId: mission.id, nextState: "FAILED" });
  }

  await recordAuditEvent(supabase, {
    tenantId: mission.tenant_id,
    actorKind: "hermes",
    action: "mission.executed",
    targetType: "mission",
    targetId: mission.id,
  });
}

export async function processOnce(
  supabase: ReturnType<typeof createServiceClient>,
  queue: QueueAdapter,
  hermes: HermesRuntimeAdapter
): Promise<boolean> {
  const globalKill = await isKillSwitchActive(supabase, [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: WORKER_TYPE },
  ]);
  if (globalKill.active) {
    return false; // Stop claiming new work; already-claimed jobs still finish/fail normally.
  }

  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes: [JOB_TYPE], leaseSeconds: LEASE_SECONDS });
  if (!job) return false;

  await recordWorkerHeartbeat(supabase, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "busy", version: VERSION });

  try {
    const { missionId } = job.payload as { missionId: string };

    const missionKill = await isKillSwitchActive(supabase, [
      { scope: "tenant", scopeId: job.tenant_id },
      { scope: "mission", scopeId: missionId },
    ]);
    if (missionKill.active) {
      // Preserve the job for later — do not consume it as a real failed
      // attempt, and never silently execute a killed tenant/mission's work.
      await queue.fail({
        jobId: job.id,
        leaseOwner: LEASE_OWNER,
        error: { message: `kill switch active (${missionKill.scope}): ${missionKill.reason ?? "no reason given"}`, retryable: true },
      });
      return true;
    }

    const mission = await getMission(supabase, missionId);
    await executeMission(supabase, queue, job.id, hermes, mission);
    await queue.complete({ jobId: job.id, leaseOwner: LEASE_OWNER });
  } catch (err) {
    await queue.fail({
      jobId: job.id,
      leaseOwner: LEASE_OWNER,
      error: { message: err instanceof Error ? err.message : String(err), retryable: true },
    });
  }
  return true;
}

function startHealthServer(supabase: ReturnType<typeof createServiceClient>) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      getWorkerHealth(supabase, WORKER_TYPE)
        .then((report) => {
          const httpStatus = report.status === "healthy" ? 200 : report.status === "degraded" ? 200 : 503;
          res.writeHead(httpStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...report, version: VERSION }));
        })
        .catch((err) => {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "unavailable", reason: err instanceof Error ? err.message : String(err) }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, () => console.log(`[mission-worker] health server listening on :${PORT}`));
  return server;
}

if (process.env.NODE_ENV !== "test") {
  const supabase = createServiceClient();
  const queue = createPostgresQueueAdapter(supabase);
  const hermes = selectHermesAdapter();

  startHealthServer(supabase);
  recordWorkerHeartbeat(supabase, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
    console.error("[mission-worker] initial heartbeat failed:", err)
  );

  console.log(`[mission-worker] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}, Hermes mode: ${hermes.mode}`);
  setInterval(() => {
    processOnce(supabase, queue, hermes)
      .then((claimed) => {
        if (!claimed) {
          recordWorkerHeartbeat(supabase, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch(() => {});
        }
      })
      .catch((err) => {
        console.error("[mission-worker] poll cycle failed:", err);
        recordWorkerHeartbeat(supabase, {
          workerType: WORKER_TYPE,
          instanceId: INSTANCE_ID,
          status: "degraded",
          version: VERSION,
          lastError: { message: err instanceof Error ? err.message : String(err) },
        }).catch(() => {});
      });
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[mission-worker] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
