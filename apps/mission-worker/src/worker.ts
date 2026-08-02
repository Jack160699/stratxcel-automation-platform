import os from "node:os";
import {
  createServiceClient,
  getMission,
  transitionMission,
  appendMissionEvent,
  type MissionRow,
} from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import { createPostgresQueueAdapter, type QueueAdapter } from "@stratxcel/queue";
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
const LEASE_OWNER = `mission-worker-${os.hostname()}-${process.pid}`;
const JOB_TYPE = "mission.execute";

const OUTCOME_TO_STATE = {
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  FAILED: "FAILED",
  AWAITING_INPUT: "AWAITING_INPUT",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
  BLOCKED: "BLOCKED",
} as const;

async function executeMission(
  supabase: ReturnType<typeof createServiceClient>,
  hermes: HermesRuntimeAdapter,
  mission: MissionRow
): Promise<void> {
  const running = await transitionMission(supabase, { missionId: mission.id, nextState: "RUNNING" });

  try {
    const context = await compileMissionContext(supabase, running);
    const missionToken = issueMissionToken({
      missionId: running.id,
      tenantId: running.tenant_id,
      allowedTools: context.allowedTools,
    });

    const result = await hermes.execute(running, context, missionToken);
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
  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes: [JOB_TYPE] });
  if (!job) return false;

  try {
    const { missionId } = job.payload as { missionId: string };
    const mission = await getMission(supabase, missionId);
    await executeMission(supabase, hermes, mission);
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

if (process.env.NODE_ENV !== "test") {
  const supabase = createServiceClient();
  const queue = createPostgresQueueAdapter(supabase);
  const hermes = selectHermesAdapter();

  console.log(`[mission-worker] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}, Hermes mode: ${hermes.mode}`);
  setInterval(() => {
    processOnce(supabase, queue, hermes).catch((err) => {
      console.error("[mission-worker] poll cycle failed:", err);
    });
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[mission-worker] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
