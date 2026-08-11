import type {
  OpsIssue,
  OpsMissionRecord,
  OperationsOversight,
} from "../types.ts";

const BLOCKED_STATES = new Set([
  "WAITING_CAPABILITY",
  "WAITING_APPROVAL",
  "FAILED",
  "REVISION_REQUIRED",
]);

export function listBlockedMissions(queue: readonly OpsMissionRecord[]): OpsMissionRecord[] {
  return queue.filter(
    (m) =>
      m.status === "NEEDS_ATTENTION" ||
      m.status === "FAILED" ||
      m.deadLetter === true ||
      m.stages.some((s) => BLOCKED_STATES.has(String(s.state)) || Boolean(s.blockedCapability)),
  );
}

/**
 * Operational oversight for mission_execution — not System Health.
 */
export function buildOperationsOversight(
  missions: readonly OpsMissionRecord[],
): OperationsOversight {
  const queue = [...missions];
  const blockedMissions = listBlockedMissions(queue);
  const issues: OpsIssue[] = [];

  for (const mission of queue) {
    for (const stage of mission.stages) {
      if (stage.state === "WAITING_CAPABILITY" || stage.blockedCapability) {
        issues.push({
          kind: "waiting_capability",
          missionId: mission.missionId,
          stageId: stage.stageId,
          detail: stage.blockedCapability ?? "capability_unavailable",
          severity: "warning",
        });
      }
      if (stage.state === "WAITING_APPROVAL") {
        issues.push({
          kind: "waiting_approval",
          missionId: mission.missionId,
          stageId: stage.stageId,
          detail: "stage waiting approval",
          severity: "warning",
        });
      }
      if (stage.attempts >= stage.maxAttempts && stage.state === "FAILED") {
        issues.push({
          kind: "retry_exhausted",
          missionId: mission.missionId,
          stageId: stage.stageId,
          detail: `attempts ${stage.attempts}/${stage.maxAttempts}`,
          severity: "critical",
        });
      }
    }
    if ((mission.providerFailures ?? 0) > 0) {
      issues.push({
        kind: "provider_failure",
        missionId: mission.missionId,
        detail: `${mission.providerFailures} provider failure(s)`,
        severity: "warning",
      });
    }
    if ((mission.integrationFailures ?? 0) > 0) {
      issues.push({
        kind: "integration_failure",
        missionId: mission.missionId,
        detail: `${mission.integrationFailures} integration failure(s)`,
        severity: "warning",
      });
    }
    if (mission.humanHandoffsOpen > 0) {
      issues.push({
        kind: "human_handoff",
        missionId: mission.missionId,
        detail: `${mission.humanHandoffsOpen} open handoff(s)`,
        severity: "warning",
      });
    }
    if (!mission.workerHealthy) {
      issues.push({
        kind: "worker_unhealthy",
        missionId: mission.missionId,
        detail: "worker health degraded for mission execution",
        severity: "critical",
      });
    }
    if (mission.deadLetter) {
      issues.push({
        kind: "dead_letter",
        missionId: mission.missionId,
        detail: "mission in dead-letter / recovery queue",
        severity: "critical",
      });
    }
    if ((mission.ageHours ?? 0) > 72 && mission.status !== "COMPLETED") {
      issues.push({
        kind: "sla_breach",
        missionId: mission.missionId,
        detail: `mission age ${mission.ageHours}h exceeds SLA`,
        severity: "warning",
      });
    }
  }

  const approvalsBacklog = queue.reduce((sum, m) => sum + m.approvalsWaiting, 0);
  const humanHandoffsOpen = queue.reduce((sum, m) => sum + m.humanHandoffsOpen, 0);
  const retryPressure = queue.reduce(
    (sum, m) => sum + m.stages.reduce((s, st) => s + Math.max(0, st.attempts - 1), 0),
    0,
  );

  return {
    scope: "mission_execution",
    queue,
    blockedMissions,
    issues,
    approvalsBacklog,
    humanHandoffsOpen,
    retryPressure,
    workerHealthOk: queue.every((m) => m.workerHealthy),
  };
}
