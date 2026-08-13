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
  AUDIT_GENERATION_JOB_TYPE,
  createLiveAutomaticAuditExecutor,
  type AuditWorkerOutcome,
} from "@stratxcel/audit-engine";
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
import {
  createPostgresEmailOutboxStore,
  createEmailProvider,
  enqueueAuditNeedsSupportEmailBestEffort,
  enqueueMissionTerminalEmailBestEffort,
  processEmailOutboxBatch,
  resolveTenantOwnerEmailForNotify,
} from "@stratxcel/email-runtime";

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
const EMAIL_POLL_INTERVAL_MS = Number(process.env.EMAIL_OUTBOX_POLL_INTERVAL_MS ?? 15000);
const LEASE_SECONDS = Number(process.env.MISSION_WORKER_LEASE_SECONDS ?? 300);
const HEARTBEAT_DURING_EXECUTE_MS = Math.max(5000, Math.floor((LEASE_SECONDS * 1000) / 3));
const WORKER_TYPE = "mission-worker" as const;
const EMAIL_WORKER_TYPE = "email-processor" as const;
const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
const LEASE_OWNER = `${WORKER_TYPE}-${INSTANCE_ID}`;
const EMAIL_LEASE_OWNER = `${EMAIL_WORKER_TYPE}-${INSTANCE_ID}`;
const MISSION_JOB_TYPE = "mission.execute";
const VERSION = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const PORT = Number(process.env.PORT ?? 8083);

// Hosted email outbox processor — independent of mission claims / Hermes / Audit jobs.
if (!process.env.EMAIL_PROCESSOR_MODE) {
  process.env.EMAIL_PROCESSOR_MODE = "mission-worker";
}

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

  let terminalState: string | null = null;
  let terminalSummary: string | null = null;
  let retryableFailure = false;

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

    const nextState = OUTCOME_TO_STATE[result.outcome];
    await transitionMission(supabase, {
      missionId: mission.id,
      nextState,
      payload: { summary: result.summary },
    });
    terminalState = nextState;
    terminalSummary = result.summary ?? null;

    for (const event of result.progressEvents ?? []) {
      await appendMissionEvent(supabase, { missionId: mission.id, eventType: "hermes_progress", payload: { ...event } });
    }
  } catch (err) {
    retryableFailure = isRetryableHermesFailure(err);
    await appendMissionEvent(supabase, {
      missionId: mission.id,
      eventType: "execution_error",
      payload: { message: err instanceof Error ? err.message : String(err), retryable: retryableFailure },
    });
    await transitionMission(supabase, { missionId: mission.id, nextState: "FAILED" });
    terminalState = "FAILED";
  }

  await recordAuditEvent(supabase, {
    tenantId: mission.tenant_id,
    actorKind: "hermes",
    action: "mission.executed",
    targetType: "mission",
    targetId: mission.id,
  });

  // Best-effort email — never rolls back mission terminal state.
  if (terminalState === "COMPLETED" || terminalState === "PARTIALLY_COMPLETED" || terminalState === "FAILED") {
    try {
      const store = createPostgresEmailOutboxStore(supabase);
      const { email, ownerId } = await resolveTenantOwnerEmailForNotify(supabase, mission.tenant_id);
      await enqueueMissionTerminalEmailBestEffort(store, {
        state: terminalState,
        missionId: mission.id,
        tenantId: mission.tenant_id,
        recipient: email,
        missionTitle: mission.goal_text?.slice(0, 120) || mission.service_key || `Mission ${mission.id.slice(0, 8)}`,
        summary: terminalSummary,
        ownerId,
        retryableFailure,
      });
    } catch (err) {
      console.error(`[mission-worker] email notify failed for mission ${mission.id}:`, err);
    }
  }
}

export async function processOnce(
  supabase: ReturnType<typeof createServiceClient>,
  queue: QueueAdapter,
  hermes: HermesRuntimeAdapter,
  auditExecutor?: {
    execute(input: { runId: string; attemptNumber: number; maxAttempts: number; expectedTenantId?: string }): Promise<AuditWorkerOutcome>;
  },
): Promise<boolean> {
  const globalKill = await isKillSwitchActive(supabase, [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: WORKER_TYPE },
  ]);
  if (globalKill.active) {
    return false; // Stop claiming new work; already-claimed jobs still finish/fail normally.
  }

  const jobTypes = auditExecutor
    ? [MISSION_JOB_TYPE, AUDIT_GENERATION_JOB_TYPE]
    : [MISSION_JOB_TYPE];
  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes, leaseSeconds: LEASE_SECONDS });
  if (!job) return false;

  await recordWorkerHeartbeat(supabase, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "busy", version: VERSION });

  try {
    if (job.job_type === AUDIT_GENERATION_JOB_TYPE) {
      const runId = typeof job.payload.auditGenerationRunId === "string"
        ? job.payload.auditGenerationRunId
        : "";
      if (!runId || !auditExecutor) {
        await queue.fail({
          jobId: job.id,
          leaseOwner: LEASE_OWNER,
          error: {
            message: "audit generation job is missing a valid run or executor",
            code: "INVALID_AUDIT_GENERATION_JOB",
            retryable: false,
          },
        });
        return true;
      }

      const tenantKill = await isKillSwitchActive(supabase, [
        { scope: "tenant", scopeId: job.tenant_id },
      ]);
      if (tenantKill.active) {
        await queue.fail({
          jobId: job.id,
          leaseOwner: LEASE_OWNER,
          error: {
            message: `kill switch active (${tenantKill.scope}): ${tenantKill.reason ?? "no reason given"}`,
            retryable: true,
          },
        });
        return true;
      }

      const outcome = await executeWithLeaseHeartbeat(queue, job.id, () =>
        auditExecutor.execute({
          runId,
          attemptNumber: job.attempt_count,
          maxAttempts: job.max_attempts,
          expectedTenantId: job.tenant_id,
        }),
      );
      if (outcome.kind === "RETRY") {
        await queue.fail({
          jobId: job.id,
          leaseOwner: LEASE_OWNER,
          error: {
            message: outcome.message,
            code: outcome.code,
            retryable: true,
          },
        });
      } else {
        await queue.complete({ jobId: job.id, leaseOwner: LEASE_OWNER });
        // Best-effort transactional email — never undoes Audit completion or queue completion.
        if (outcome.kind === "NEEDS_REVIEW") {
          await notifyAutomaticAuditEmailBestEffort(supabase, runId, job.tenant_id);
        }
      }
      return true;
    }

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

async function notifyAutomaticAuditEmailBestEffort(
  supabase: ReturnType<typeof createServiceClient>,
  runId: string,
  tenantId: string,
): Promise<void> {
  try {
    const store = createPostgresEmailOutboxStore(supabase);
    const { data: run } = await supabase
      .from("audit_generation_runs")
      .select("audit_order_id, tenant_id, failure_message_safe")
      .eq("id", runId)
      .maybeSingle();
    const auditOrderId = typeof run?.audit_order_id === "string" ? run.audit_order_id : "";
    if (!auditOrderId) return;
    const { data: order } = await supabase
      .from("audit_orders")
      .select("id, tenant_id, guest_email, claimed_by, business_name, status")
      .eq("id", auditOrderId)
      .maybeSingle();
    if (!order) return;
    await enqueueAuditNeedsSupportEmailBestEffort(store, {
      auditOrderId,
      tenantId: (run?.tenant_id as string | null) ?? tenantId,
      businessName: (order.business_name as string | null) ?? null,
      reason: (run?.failure_message_safe as string | null) ?? "Automatic Audit needs staff review.",
    });
  } catch (err) {
    console.error(`[mission-worker] audit email notify failed for run ${runId}:`, err);
  }
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
  const auditExecutor = createLiveAutomaticAuditExecutor(supabase);
  const emailStore = createPostgresEmailOutboxStore(supabase);
  const emailProvider = createEmailProvider();

  startHealthServer(supabase);
  recordWorkerHeartbeat(supabase, { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
    console.error("[mission-worker] initial heartbeat failed:", err)
  );
  recordWorkerHeartbeat(supabase, {
    workerType: EMAIL_WORKER_TYPE,
    instanceId: INSTANCE_ID,
    status: "idle",
    version: VERSION,
  }).catch((err) => console.error("[mission-worker] email-processor initial heartbeat failed:", err));

  console.log(`[mission-worker] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}, Hermes mode: ${hermes.mode}`);
  console.log(
    `[mission-worker] email outbox polling every ${EMAIL_POLL_INTERVAL_MS}ms as ${EMAIL_LEASE_OWNER} (independent of mission jobs)`
  );
  setInterval(() => {
    processOnce(supabase, queue, hermes, auditExecutor)
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

  // Independent email outbox loop — continues even when no missions / Hermes disabled.
  setInterval(() => {
    processEmailOutboxBatch(emailStore, emailProvider, {
      limit: 20,
      leaseOwner: EMAIL_LEASE_OWNER,
    })
      .then((result) => {
        recordWorkerHeartbeat(supabase, {
          workerType: EMAIL_WORKER_TYPE,
          instanceId: INSTANCE_ID,
          status: result.claimed > 0 ? "busy" : "idle",
          version: VERSION,
          queueBacklogHint: result.claimed,
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("[mission-worker] email outbox poll failed:", err);
        recordWorkerHeartbeat(supabase, {
          workerType: EMAIL_WORKER_TYPE,
          instanceId: INSTANCE_ID,
          status: "degraded",
          version: VERSION,
          lastError: { message: err instanceof Error ? err.message : String(err) },
        }).catch(() => {});
      });
  }, EMAIL_POLL_INTERVAL_MS);
}
