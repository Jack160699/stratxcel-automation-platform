import type { MissionState } from "./types";

/**
 * Encodes the mission state diagram from the master build brief exactly:
 *
 *   DRAFT -> ESTIMATING -> AWAITING_FUNDS/READY -> QUEUED -> RUNNING
 *   -> AWAITING_INPUT/AWAITING_APPROVAL/HUMAN_HANDOFF -> RESUMED
 *   -> COMPLETED/PARTIALLY_COMPLETED/FAILED/CANCELLED/BLOCKED
 *
 * BLOCKED is reachable from RUNNING (a Hermes run hits an unresolvable
 * blocker) or from ESTIMATING (the compiler can't produce an estimate at
 * all) and can resume back to QUEUED once the blocker clears — the brief's
 * diagram doesn't spell out BLOCKED's exit edge, so this is a deliberate,
 * documented interpretation rather than an implicit assumption.
 * CANCELLED is reachable from every non-terminal state, since a tenant
 * must always be able to cancel a mission regardless of where it is.
 */
const TERMINAL_STATES: ReadonlySet<MissionState> = new Set([
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const ALLOWED_TRANSITIONS: Record<MissionState, ReadonlySet<MissionState>> = {
  DRAFT: new Set(["ESTIMATING", "CANCELLED"]),
  ESTIMATING: new Set(["AWAITING_FUNDS", "READY", "BLOCKED", "CANCELLED"]),
  AWAITING_FUNDS: new Set(["READY", "CANCELLED"]),
  READY: new Set(["QUEUED", "CANCELLED"]),
  QUEUED: new Set(["RUNNING", "CANCELLED"]),
  RUNNING: new Set([
    "AWAITING_INPUT",
    "AWAITING_APPROVAL",
    "HUMAN_HANDOFF",
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "FAILED",
    "CANCELLED",
    "BLOCKED",
  ]),
  AWAITING_INPUT: new Set(["RESUMED", "CANCELLED"]),
  AWAITING_APPROVAL: new Set(["RESUMED", "CANCELLED"]),
  HUMAN_HANDOFF: new Set(["RESUMED", "CANCELLED"]),
  RESUMED: new Set(["RUNNING", "CANCELLED"]),
  BLOCKED: new Set(["QUEUED", "CANCELLED"]),
  COMPLETED: new Set(),
  PARTIALLY_COMPLETED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

export function isTerminalState(state: MissionState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransition(from: MissionState, to: MissionState): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

export class InvalidMissionTransitionError extends Error {
  readonly from: MissionState;
  readonly to: MissionState;
  constructor(from: MissionState, to: MissionState) {
    super(`Invalid mission state transition: ${from} -> ${to}`);
    this.name = "InvalidMissionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: MissionState, to: MissionState): void {
  if (!canTransition(from, to)) throw new InvalidMissionTransitionError(from, to);
}
