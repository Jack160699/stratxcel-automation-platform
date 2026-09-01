// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/mission-outcome.test.ts
import assert from "node:assert/strict";
import { interpretMissionOutcome } from "../tools/mission-outcome.ts";

// VERIFICATION INTEGRITY regression (autonomous-convergence-loop mission,
// section 10 -- "universalize the existing interpretOutcome architecture").
// createAndEstimateMission (@stratxcel/missions) can return a mission stuck
// in AWAITING_FUNDS, or -- via its idempotency-key reuse path -- any other
// non-terminal MissionState, without ever throwing. Both create_mission
// tools (staff, in admin/mutation-tools.ts, and client, in
// client/tools.ts) share this exact classifier so the two can never
// silently drift apart on what counts as a real success.

function run() {
  // Genuinely proceeding -- no verification note should be added.
  assert.equal(interpretMissionOutcome({ mission: { state: "QUEUED" } }), null);
  assert.equal(interpretMissionOutcome({ mission: { state: "RUNNING" } }), null);
  assert.equal(interpretMissionOutcome({ mission: { state: "RESUMED" } }), null);

  // The real, live-observed-class defect: a non-throwing result that is NOT
  // actually proceeding must never be reported as success.
  const awaitingFunds = interpretMissionOutcome({ mission: { state: "AWAITING_FUNDS" } });
  assert.equal(awaitingFunds?.status, "pending");
  assert.match(awaitingFunds?.detail ?? "", /insufficient wallet balance/);

  for (const state of ["AWAITING_INPUT", "AWAITING_APPROVAL", "HUMAN_HANDOFF"]) {
    const outcome = interpretMissionOutcome({ mission: { state } });
    assert.equal(outcome?.status, "pending", `${state} must be pending, not silently success`);
  }

  for (const state of ["FAILED", "CANCELLED", "BLOCKED"]) {
    const outcome = interpretMissionOutcome({ mission: { state } });
    assert.equal(outcome?.status, "failed", `${state} must be failed, not silently success`);
  }

  // DRAFT/ESTIMATING/READY should not normally be the function's final
  // return, but if seen, must still not be reported as a completed success.
  const stillDraft = interpretMissionOutcome({ mission: { state: "DRAFT" } });
  assert.equal(stillDraft?.status, "pending");

  // Additive-safety / no-crash guarantees.
  assert.equal(interpretMissionOutcome(null), null);
  assert.equal(interpretMissionOutcome({}), null);
  assert.equal(interpretMissionOutcome({ mission: {} }), null);
  assert.equal(interpretMissionOutcome({ notMission: true }), null);

  console.log("mission-outcome.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
