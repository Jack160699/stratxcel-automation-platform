import type { ToolOutcome } from "./contract.ts";

/**
 * Shared interpretOutcome logic for every tool that wraps
 * @stratxcel/missions' createAndEstimateMission -- used by both
 * admin/mutation-tools.ts's create_mission (staff) and client/tools.ts's
 * create_mission (client), which independently call the exact same
 * repository function and therefore share the exact same soft-failure
 * surface. A single shared function here rather than the same logic
 * copy-pasted twice, so the two can never silently drift apart.
 *
 * VERIFICATION INTEGRITY (autonomous-convergence-loop mission, section 10
 * -- "universalize the existing interpretOutcome architecture... applies
 * globally"). Found by auditing every mutating tool for the same class of
 * defect Updates 10/13 fixed live: createAndEstimateMission can return a
 * mission stuck in AWAITING_FUNDS (real wallet balance < estimated cost)
 * -- or, via its idempotency-key reuse path, ANY non-terminal
 * MissionState -- without ever throwing. A model summarizing that raw
 * JSON has no reliable reason to notice "queued to actually run" and
 * "created but stuck waiting on funds/approval/input" are different
 * outcomes. Only QUEUED/RUNNING/RESUMED count as this tool's own promise
 * ("compile a goal into a mission and estimate cost") having genuinely
 * proceeded; every other non-terminal state is a real reason nothing is
 * executing yet.
 */
export function interpretMissionOutcome(result: unknown): ToolOutcome | null {
  const mission = (result as { mission?: { state?: string } } | null)?.mission;
  const state = mission?.state;
  if (!state) return null;
  if (state === "QUEUED" || state === "RUNNING" || state === "RESUMED") return null;
  if (state === "AWAITING_FUNDS") return { status: "pending", detail: "insufficient wallet balance for the estimated cost -- add funds to proceed" };
  if (state === "AWAITING_INPUT" || state === "AWAITING_APPROVAL" || state === "HUMAN_HANDOFF") {
    return { status: "pending", detail: `needs ${state.toLowerCase().replaceAll("_", " ")} before it can proceed` };
  }
  if (state === "FAILED" || state === "CANCELLED" || state === "BLOCKED") return { status: "failed", detail: `mission ended in state ${state}` };
  // DRAFT/ESTIMATING/READY should not normally be the final state this
  // function returns, but if seen, the mission has not actually started.
  return { status: "pending", detail: `mission is still ${state.toLowerCase()}, not yet executing` };
}
