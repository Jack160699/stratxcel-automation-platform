import type { WorkforceEvent } from "../../events/emit.ts";
import type { MissionReconstruction } from "../types.ts";

const SECRET_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|authorization|credential|private[_-]?key|service[_-]?role)/i;

/**
 * Reconstruct a mission timeline from workforce events — no secrets.
 */
export function reconstructMissionFromEvents(input: {
  tenantId: string;
  missionId: string;
  events: readonly WorkforceEvent[];
}): MissionReconstruction {
  const scoped = input.events.filter(
    (e) => e.payload.tenantId === input.tenantId && e.payload.missionId === input.missionId,
  );

  const timeline: MissionReconstruction["timeline"][number][] = [];

  for (const event of scoped) {
    assertNoSecrets(event);
    const phase = mapEventToPhase(event.name);
    timeline.push({
      phase,
      atIso: event.atIso,
      summary: summarizeEvent(event),
      eventName: event.name,
    });
  }

  const phasesPresent = new Set(timeline.map((t) => t.phase));
  const expected = [
    "ceo_plan",
    "department",
    "specialist_run",
    "artifact",
    "review",
    "approval",
    "execution",
    "receipt",
    "result",
  ] as const;
  const missingPhases = expected.filter((p) => !phasesPresent.has(p));

  // A reconstruction is "complete enough" when plan → departments → results exist
  const complete =
    phasesPresent.has("ceo_plan") &&
    (phasesPresent.has("department") || phasesPresent.has("specialist_run")) &&
    (phasesPresent.has("result") || phasesPresent.has("receipt") || phasesPresent.has("review"));

  return {
    missionId: input.missionId,
    tenantId: input.tenantId,
    timeline,
    secretsPresent: false,
    complete,
    missingPhases,
  };
}

function mapEventToPhase(
  name: WorkforceEvent["name"],
): MissionReconstruction["timeline"][number]["phase"] {
  switch (name) {
    case "workforce.plan.created":
    case "workforce.plan.validated":
    case "workforce.plan.revised":
      return "ceo_plan";
    case "workforce.stage.ready":
      return "department";
    case "workforce.stage.started":
      return "specialist_run";
    case "workforce.stage.completed":
      return "artifact";
    case "workforce.review.completed":
    case "workforce.revision.requested":
      return "review";
    case "workforce.handoff.created":
      return "approval";
    case "workforce.stage.failed":
    case "workforce.capability.blocked":
      return "execution";
    default:
      return "result";
  }
}

function summarizeEvent(event: WorkforceEvent): string {
  const dept = event.payload.department ? ` dept=${event.payload.department}` : "";
  const role = event.payload.role ? ` role=${event.payload.role}` : "";
  const stage = event.payload.stageId ? ` stage=${event.payload.stageId}` : "";
  return `${event.name}${dept}${role}${stage}`;
}

function assertNoSecrets(event: WorkforceEvent): void {
  const blob = JSON.stringify(event.payload.data ?? {});
  if (SECRET_KEY_PATTERN.test(blob)) {
    throw new Error("mission_reconstruction_secret_leak");
  }
  for (const key of Object.keys(event.payload.data ?? {})) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error("mission_reconstruction_secret_leak");
    }
  }
}

/** Extend event names used by E2E harness for richer reconstruction. */
export type ExtendedWorkforceEventName =
  | WorkforceEvent["name"]
  | "workforce.approval.recorded"
  | "workforce.execution.receipt"
  | "workforce.result.recorded";

export function appendReconstructionHints(
  base: MissionReconstruction,
  hints: readonly {
    phase: MissionReconstruction["timeline"][number]["phase"];
    atIso: string;
    summary: string;
  }[],
): MissionReconstruction {
  const timeline = [...base.timeline, ...hints];
  const phasesPresent = new Set(timeline.map((t) => t.phase));
  const expected = [
    "ceo_plan",
    "department",
    "specialist_run",
    "artifact",
    "review",
    "approval",
    "execution",
    "receipt",
    "result",
  ] as const;
  return {
    ...base,
    timeline,
    missingPhases: expected.filter((p) => !phasesPresent.has(p)),
    complete: expected.every((p) => phasesPresent.has(p)),
    secretsPresent: false,
  };
}
