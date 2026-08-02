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
import { createNotIntegratedHermesAdapter, type HermesRuntimeAdapter } from "./hermes-adapter.ts";

/**
 * Standalone async mission executor — separated from the Next.js dashboard
 * so a long Hermes run never runs inside a Vercel request lifecycle
 * (master brief rule: "Long missions must be asynchronous"). Claims
 * 'mission.execute' jobs from the shared Postgres queue (the same
 * transactional FOR UPDATE SKIP LOCKED mechanism apps/whatsapp-worker's
 * processor uses), moves the mission to RUNNING, hands it to the Hermes
 * adapter, and applies whatever outcome comes back.
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
    const result = await hermes.execute(running);
    await transitionMission(supabase, {
      missionId: mission.id,
      nextState: OUTCOME_TO_STATE[result.outcome],
      payload: { summary: result.summary },
    });
  } catch (err) {
    await appendMissionEvent(supabase, {
      missionId: mission.id,
      eventType: "execution_error",
      payload: { message: err instanceof Error ? err.message : String(err) },
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
  const hermes = createNotIntegratedHermesAdapter();

  console.log(`[mission-worker] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}`);
  setInterval(() => {
    processOnce(supabase, queue, hermes).catch((err) => {
      console.error("[mission-worker] poll cycle failed:", err);
    });
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[mission-worker] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
