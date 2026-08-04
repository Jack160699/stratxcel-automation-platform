import os from "node:os";
import {
  createServiceClient,
  getMission,
  transitionMission,
  appendMissionEvent,
  appendMissionEventIdempotent,
  recordHermesRunSubmitted,
  recordMissionHeartbeat,
  recordMissionUsage,
  type MissionRow,
} from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import { createPostgresQueueAdapter, type QueueAdapter } from "@stratxcel/queue";
import {
  compileMissionContext,
  issueMissionToken,
  selectHermesAdapter,
  isRetryableHermesFailure,
  normalizeHermesEvent,
  resolveHermesNativeProfile,
  assertContextWithinTokenCeiling,
  TokenCeilingExceededError,
  OutputTokenTracker,
  type AgentRuntimeAdapter,
} from "@stratxcel/hermes";
import type { RunStatusResponse, RunStatus } from "@stratxcel/hermes-contract";

/**
 * Standalone async mission executor — separated from the Next.js dashboard
 * so a long Hermes run never runs inside a Vercel request lifecycle
 * (master brief rule: "Long missions must be asynchronous"). Claims
 * 'mission.execute' jobs from the shared Postgres queue, moves the mission
 * to RUNNING, compiles a restricted mission-scoped context, submits to the
 * selected AgentRuntimeAdapter (disabled by default; 'mock' or 'http' via
 * HERMES_MODE), and reconciles against GET /v1/runs/{run_id} — the
 * terminal-state source of truth, since the Runs API's SSE stream has no
 * reconnect/replay window (see docs/hermes/EVENT_MODEL.md).
 */

const POLL_INTERVAL_MS = Number(process.env.MISSION_WORKER_POLL_INTERVAL_MS ?? 5000);
const MAX_CONCURRENT_MISSIONS = Number(process.env.MISSION_WORKER_MAX_CONCURRENT ?? 3);
const RECONCILE_TIMEOUT_MS = Number(process.env.MISSION_WORKER_RECONCILE_TIMEOUT_MS ?? 120_000);
const RECONCILE_POLL_INTERVAL_MS = Number(process.env.MISSION_WORKER_RECONCILE_POLL_INTERVAL_MS ?? 5000);
const LEASE_HEARTBEAT_MIN_INTERVAL_MS = 15_000;
const LEASE_OWNER = `mission-worker-${os.hostname()}-${process.pid}`;
const JOB_TYPE = "mission.execute";

const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["completed", "failed", "cancelled", "waiting_for_approval"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown when a run is still queued/running/stopping after the bounded reconcile window — signals "retry the job later," not "the mission failed." */
class RunStillInProgressError extends Error {
  constructor(runId: string, status: RunStatus) {
    super(`Hermes run ${runId} is still ${status} after ${RECONCILE_TIMEOUT_MS}ms — deferring to a later worker attempt`);
    this.name = "RunStillInProgressError";
  }
}

/**
 * GET /v1/runs/{run_id} is the durable recovery path — no SSE replay
 * exists, so this is what a worker calls after submitting (to catch a run
 * that finished during/after a dropped stream) and on every retry of an
 * already-submitted mission (reconnecting the SSE stream for an
 * already-running run has been observed to silently drop future events —
 * see docs/hermes/RECONCILIATION.md — so retries poll only, they never
 * re-attach to the stream).
 */
async function pollUntilTerminalOrApproval(hermes: AgentRuntimeAdapter, runId: string): Promise<RunStatusResponse> {
  const deadline = Date.now() + RECONCILE_TIMEOUT_MS;
  let status = await hermes.getRun(runId);
  while (!TERMINAL_RUN_STATUSES.includes(status.status) && Date.now() < deadline) {
    await sleep(RECONCILE_POLL_INTERVAL_MS);
    status = await hermes.getRun(runId);
  }
  return status;
}

async function heartbeatLease(queue: QueueAdapter, jobId: string, lastHeartbeatAt: { at: number }): Promise<void> {
  const now = Date.now();
  if (now - lastHeartbeatAt.at < LEASE_HEARTBEAT_MIN_INTERVAL_MS) return;
  lastHeartbeatAt.at = now;
  await queue.heartbeat({ jobId, leaseOwner: LEASE_OWNER });
}

async function executeMission(
  supabase: ReturnType<typeof createServiceClient>,
  queue: QueueAdapter,
  jobId: string,
  hermes: AgentRuntimeAdapter,
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
    const profile = resolveHermesNativeProfile(running);

    let runId = running.hermes_run_id;
    const isNewSubmission = !runId;

    if (!runId) {
      const submitContext = {
        serviceKey: context.serviceKey,
        hermesProfile: context.hermesProfile,
        brandBrainVersion: context.brandBrainVersion,
        allowedTools: context.allowedTools,
        missionToken,
      };

      // Preflight, before any Hermes call is made — see
      // packages/hermes/src/budget.ts: an oversized context must be
      // refused, not paid for.
      try {
        assertContextWithinTokenCeiling(running.id, running.goal_text, submitContext, profile);
      } catch (ceilingErr) {
        if (ceilingErr instanceof TokenCeilingExceededError) {
          await appendMissionEvent(supabase, {
            missionId: running.id,
            eventType: "budget_exceeded",
            payload: { stage: "preflight", message: ceilingErr.message },
          });
          await recordAuditEvent(supabase, {
            tenantId: running.tenant_id,
            actorKind: "hermes",
            action: "mission.budget_exceeded",
            targetType: "mission",
            targetId: running.id,
            metadata: { stage: "preflight" },
          });
          await transitionMission(supabase, { missionId: running.id, nextState: "FAILED", payload: { reason: "budget_exceeded" } });
          return;
        }
        throw ceilingErr;
      }

      const submitted = await hermes.submitMission({
        missionId: running.id,
        idempotencyKey: running.idempotency_key ?? running.id,
        tenantId: running.tenant_id,
        profile,
        brief: running.goal_text,
        context: submitContext,
      });
      runId = submitted.runId;
      await recordHermesRunSubmitted(supabase, { missionId: running.id, runId });
    }

    // Only the submitting attempt streams live — a retry reconnecting to an
    // already-running run has no replay guarantee, so retries poll only.
    if (isNewSubmission) {
      const lastHeartbeatAt = { at: 0 };
      const outputTracker = new OutputTokenTracker();
      let stoppedForBudget = false;
      try {
        await hermes.streamEvents(runId, { tenantId: running.tenant_id, missionId: running.id }, async (event) => {
          for (const normalized of normalizeHermesEvent(event)) {
            await appendMissionEventIdempotent(supabase, {
              missionId: running.id,
              runId: event.runId,
              sequence: normalized.sequence,
              eventType: normalized.type,
              payload: normalized.payload,
            });
          }
          await recordMissionHeartbeat(supabase, { missionId: running.id, hermesStatus: "running", lastEventAt: event.receivedAt });
          await heartbeatLease(queue, jobId, lastHeartbeatAt);

          if (event.type === "message.delta") outputTracker.accumulate(event.textDelta);
          if (event.type === "reasoning.available") outputTracker.accumulate(event.reasoning);
          if (outputTracker.exceeded && !stoppedForBudget) {
            stoppedForBudget = true;
            await hermes.stopRun(runId!);
            await appendMissionEvent(supabase, {
              missionId: running.id,
              eventType: "budget_exceeded",
              payload: { stage: "streaming", estimatedOutputTokens: outputTracker.estimated },
            });
            await recordAuditEvent(supabase, {
              tenantId: running.tenant_id,
              actorKind: "hermes",
              action: "mission.budget_exceeded",
              targetType: "mission",
              targetId: running.id,
              metadata: { stage: "streaming", estimatedOutputTokens: outputTracker.estimated },
            });
          }
        });
      } catch (streamErr) {
        // No reconnect/replay exists — a dropped stream is not a mission
        // failure, it just means reconciliation below relies on polling
        // instead of having observed a terminal event directly.
        await appendMissionEvent(supabase, {
          missionId: running.id,
          eventType: "stream_disconnected",
          payload: { message: streamErr instanceof Error ? streamErr.message : String(streamErr) },
        });
      }
    }

    const runStatus = await pollUntilTerminalOrApproval(hermes, runId);

    if (runStatus.usage) {
      await recordMissionUsage(supabase, {
        missionId: running.id,
        inputTokens: runStatus.usage.inputTokens,
        outputTokens: runStatus.usage.outputTokens,
        totalTokens: runStatus.usage.totalTokens,
      });
    }

    const current = await getMission(supabase, running.id);
    if (current.state !== "RUNNING") {
      // Mission moved on through some other path (e.g. a human cancelled it)
      // while we were submitting/streaming/polling — nothing left to
      // reconcile here.
      return;
    }

    switch (runStatus.status) {
      case "completed":
        await transitionMission(supabase, { missionId: running.id, nextState: "COMPLETED", payload: { output: runStatus.output } });
        break;
      case "failed": {
        let transcriptNote: Record<string, unknown> | undefined;
        const backfill = await hermes.getTranscriptBackfill(runId);
        if (backfill) transcriptNote = { messageCount: backfill.messages.length };
        await transitionMission(supabase, {
          missionId: running.id,
          nextState: "FAILED",
          payload: { error: runStatus.error, transcriptBackfill: transcriptNote },
        });
        break;
      }
      case "cancelled":
        await transitionMission(supabase, { missionId: running.id, nextState: "CANCELLED" });
        break;
      case "waiting_for_approval":
        await transitionMission(supabase, { missionId: running.id, nextState: "AWAITING_APPROVAL" });
        break;
      default:
        throw new RunStillInProgressError(runId, runStatus.status);
    }
  } catch (err) {
    if (err instanceof RunStillInProgressError) {
      await appendMissionEvent(supabase, { missionId: mission.id, eventType: "reconcile_deferred", payload: { message: err.message } });
      throw err; // retryable at the queue level; mission stays RUNNING for the next attempt
    }

    await appendMissionEvent(supabase, {
      missionId: mission.id,
      eventType: "execution_error",
      payload: { message: err instanceof Error ? err.message : String(err), retryable: isRetryableHermesFailure(err) },
    });

    const current = await getMission(supabase, mission.id);
    if (current.state === "RUNNING") {
      await transitionMission(supabase, { missionId: mission.id, nextState: "FAILED" });
    }
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
  hermes: AgentRuntimeAdapter
): Promise<boolean> {
  const job = await queue.claimNext({ leaseOwner: LEASE_OWNER, jobTypes: [JOB_TYPE] });
  if (!job) return false;

  try {
    const { missionId } = job.payload as { missionId: string };
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

if (process.env.NODE_ENV !== "test") {
  const supabase = createServiceClient();
  const queue = createPostgresQueueAdapter(supabase);
  const hermes = selectHermesAdapter();

  let inFlight = 0;

  console.log(
    `[mission-worker] polling every ${POLL_INTERVAL_MS}ms as ${LEASE_OWNER}, Hermes mode: ${hermes.mode}, max concurrent missions: ${MAX_CONCURRENT_MISSIONS}`
  );
  setInterval(() => {
    if (inFlight < MAX_CONCURRENT_MISSIONS) {
      inFlight++;
      processOnce(supabase, queue, hermes)
        .catch((err) => {
          console.error("[mission-worker] poll cycle failed:", err);
        })
        .finally(() => {
          inFlight--;
        });
    }
    queue.recoverExpiredLeases().catch((err) => {
      console.error("[mission-worker] lease recovery failed:", err);
    });
  }, POLL_INTERVAL_MS);
}
