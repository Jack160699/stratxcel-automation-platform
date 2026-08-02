import {
  createServiceClient,
  listMissionsByState,
  transitionMission,
  appendMissionEvent,
  type MissionRow,
} from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import { createNotIntegratedHermesAdapter, type HermesRuntimeAdapter } from "./hermes-adapter.ts";

/**
 * Standalone async mission executor — separated from the Next.js dashboard
 * so a long Hermes run never runs inside a Vercel request lifecycle
 * (master brief rule: "Long missions must be asynchronous"). Polls for
 * QUEUED missions, moves them to RUNNING, hands them to the Hermes
 * adapter, and applies whatever outcome comes back. Not deployed anywhere
 * yet — Hermes itself isn't integrated (see hermes-adapter.ts), so this
 * currently only proves the polling/transition shape end to end.
 */

const POLL_INTERVAL_MS = Number(process.env.MISSION_WORKER_POLL_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.MISSION_WORKER_BATCH_SIZE ?? 10);

const OUTCOME_TO_STATE = {
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  FAILED: "FAILED",
  AWAITING_INPUT: "AWAITING_INPUT",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
  BLOCKED: "BLOCKED",
} as const;

async function processMission(
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
  hermes: HermesRuntimeAdapter
): Promise<number> {
  const queued = await listMissionsByState(supabase, "QUEUED", BATCH_SIZE);
  for (const mission of queued) {
    await processMission(supabase, hermes, mission);
  }
  return queued.length;
}

if (process.env.NODE_ENV !== "test") {
  const supabase = createServiceClient();
  const hermes = createNotIntegratedHermesAdapter();

  console.log(`[mission-worker] polling every ${POLL_INTERVAL_MS}ms, batch size ${BATCH_SIZE}`);
  setInterval(() => {
    processOnce(supabase, hermes).catch((err) => {
      console.error("[mission-worker] poll cycle failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
