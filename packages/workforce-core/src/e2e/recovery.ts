import assert from "node:assert/strict";
import type { StageState, WorkforceStage } from "../planning/types.ts";

export type RecoveryEventKind =
  | "provider_timeout"
  | "worker_restart"
  | "retry"
  | "quality_revision"
  | "approval_wait"
  | "capability_restoration";

export type RecoverableStage = WorkforceStage & {
  attempts: number;
  idempotencyKey: string;
  lastError?: string | null;
};

export interface MissionRecoveryState {
  missionId: string;
  tenantId: string;
  stages: RecoverableStage[];
  completedStageIds: Set<string>;
  cursor: number;
  lastEvent: RecoveryEventKind | null;
}

export function createRecoveryState(input: {
  tenantId: string;
  missionId: string;
  stages: readonly WorkforceStage[];
}): MissionRecoveryState {
  return {
    missionId: input.missionId,
    tenantId: input.tenantId,
    stages: input.stages.map((s) => ({
      ...s,
      attempts: 0,
      idempotencyKey: `${input.missionId}:${s.stageId}:v1`,
      lastError: null,
    })),
    completedStageIds: new Set(),
    cursor: 0,
    lastEvent: null,
  };
}

/**
 * Idempotent mission recovery — replaying the same completion must not double-count.
 */
export function applyRecoveryEvent(
  state: MissionRecoveryState,
  event: RecoveryEventKind,
  stageId?: string,
): MissionRecoveryState {
  const next: MissionRecoveryState = {
    ...state,
    stages: state.stages.map((s) => ({ ...s })),
    completedStageIds: new Set(state.completedStageIds),
    lastEvent: event,
  };

  const targetId = stageId ?? next.stages[next.cursor]?.stageId;
  const stage = next.stages.find((s) => s.stageId === targetId);
  if (!stage) return next;

  switch (event) {
    case "provider_timeout":
      stage.attempts += 1;
      stage.state = "FAILED";
      stage.lastError = "provider_timeout";
      break;
    case "worker_restart":
      if (stage.state === "RUNNING") stage.state = "READY";
      break;
    case "retry":
      if (stage.state === "FAILED" && stage.attempts < stage.maxAttempts) {
        stage.state = "READY";
      }
      break;
    case "quality_revision":
      stage.state = "REVISION_REQUIRED";
      break;
    case "approval_wait":
      stage.state = "WAITING_APPROVAL";
      break;
    case "capability_restoration":
      if (stage.state === "WAITING_CAPABILITY") {
        stage.state = "READY" satisfies StageState;
        stage.blockedCapability = null;
      }
      break;
  }

  return next;
}

export function completeStageIdempotent(
  state: MissionRecoveryState,
  stageId: string,
): MissionRecoveryState {
  const next: MissionRecoveryState = {
    ...state,
    stages: state.stages.map((s) => ({ ...s })),
    completedStageIds: new Set(state.completedStageIds),
  };
  if (next.completedStageIds.has(stageId)) {
    return next;
  }
  const stage = next.stages.find((s) => s.stageId === stageId);
  if (!stage) return next;
  stage.state = "COMPLETED";
  next.completedStageIds.add(stageId);
  next.cursor = Math.min(next.cursor + 1, Math.max(0, next.stages.length - 1));
  return next;
}

export function assertRecoveryIdempotent(input: {
  tenantId: string;
  missionId: string;
  stages: readonly WorkforceStage[];
}): void {
  let state = createRecoveryState(input);
  const first = state.stages[0];
  assert.ok(first);

  state = applyRecoveryEvent(state, "provider_timeout", first.stageId);
  assert.equal(state.stages[0]?.state, "FAILED");
  assert.equal(state.stages[0]?.attempts, 1);

  state = applyRecoveryEvent(state, "retry", first.stageId);
  assert.equal(state.stages[0]?.state, "READY");

  state = applyRecoveryEvent(state, "worker_restart", first.stageId);
  state = completeStageIdempotent(state, first.stageId);
  assert.equal(state.completedStageIds.has(first.stageId), true);

  const again = completeStageIdempotent(state, first.stageId);
  assert.equal(again.completedStageIds.size, state.completedStageIds.size);

  if (state.stages[1]) {
    state = applyRecoveryEvent(state, "quality_revision", state.stages[1].stageId);
    assert.equal(state.stages[1]?.state, "REVISION_REQUIRED");
    state = applyRecoveryEvent(state, "approval_wait", state.stages[1].stageId);
    assert.equal(state.stages[1]?.state, "WAITING_APPROVAL");
  }

  const waitingIdx = state.stages.findIndex((s) => s.state === "WAITING_CAPABILITY");
  if (waitingIdx >= 0) {
    state = applyRecoveryEvent(state, "capability_restoration", state.stages[waitingIdx]!.stageId);
    assert.equal(state.stages[waitingIdx]?.state, "READY");
  }
}
