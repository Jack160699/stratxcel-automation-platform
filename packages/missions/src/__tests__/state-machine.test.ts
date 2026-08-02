// Run with: node --experimental-strip-types packages/missions/src/__tests__/state-machine.test.ts
import assert from "node:assert/strict";
import { canTransition, assertTransition, isTerminalState, InvalidMissionTransitionError } from "../state-machine.ts";

function run() {
  assert.equal(canTransition("DRAFT", "ESTIMATING"), true);
  assert.equal(canTransition("ESTIMATING", "READY"), true);
  assert.equal(canTransition("ESTIMATING", "AWAITING_FUNDS"), true);
  assert.equal(canTransition("AWAITING_FUNDS", "READY"), true);
  assert.equal(canTransition("READY", "QUEUED"), true);
  assert.equal(canTransition("QUEUED", "RUNNING"), true);
  assert.equal(canTransition("RUNNING", "AWAITING_APPROVAL"), true);
  assert.equal(canTransition("AWAITING_APPROVAL", "RESUMED"), true);
  assert.equal(canTransition("RESUMED", "RUNNING"), true);
  assert.equal(canTransition("RUNNING", "COMPLETED"), true);

  assert.equal(canTransition("DRAFT", "RUNNING"), false);
  assert.equal(canTransition("DRAFT", "COMPLETED"), false);

  for (const terminal of ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"] as const) {
    assert.equal(isTerminalState(terminal), true);
    assert.equal(canTransition(terminal, "RUNNING"), false);
  }
  assert.equal(isTerminalState("RUNNING"), false);

  for (const state of [
    "DRAFT", "ESTIMATING", "AWAITING_FUNDS", "READY", "QUEUED", "RUNNING",
    "AWAITING_INPUT", "AWAITING_APPROVAL", "HUMAN_HANDOFF", "RESUMED", "BLOCKED",
  ] as const) {
    assert.equal(canTransition(state, "CANCELLED"), true, `${state} -> CANCELLED should be allowed`);
  }

  assert.equal(canTransition("BLOCKED", "QUEUED"), true);

  assert.throws(() => assertTransition("DRAFT", "RUNNING"), InvalidMissionTransitionError);
  assert.doesNotThrow(() => assertTransition("DRAFT", "ESTIMATING"));

  console.log("state-machine.test.ts (@stratxcel/missions): ALL PASS");
}

run();
