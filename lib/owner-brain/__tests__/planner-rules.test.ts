// Run with: node --experimental-strip-types lib/owner-brain/__tests__/planner-rules.test.ts
import assert from "node:assert/strict";
import { derivePlanShape } from "../planner/rules.ts";

function run() {
  // Normal day: not low energy, light meeting load -> up to 2 deep-work blocks, no "avoid" note.
  const normal = derivePlanShape({ isLowEnergy: false, meetingCount: 1, top3Candidates: ["Ship feature X", "Client call prep", "Review PR"], dueSoonItems: ["Reply to vendor"] });
  assert.equal(normal.simplify, false);
  assert.equal(normal.deepWork.length, 2, "a normal day gets up to 2 deep-work blocks");
  assert.equal(normal.whatToAvoid, undefined);
  assert.deepEqual(normal.top3, ["Ship feature X", "Client call prep", "Review PR"]);

  // "If the previous plan was overloaded: SIMPLIFY" — low energy caps the day to one block and adds an explicit avoid-note.
  const lowEnergy = derivePlanShape({ isLowEnergy: true, meetingCount: 1, top3Candidates: ["Ship feature X", "Client call prep"], dueSoonItems: [] });
  assert.equal(lowEnergy.simplify, true);
  assert.equal(lowEnergy.deepWork.length, 1, "low energy must cap to exactly one deep-work block");
  assert.match(lowEnergy.deepWork[0].reason, /Low reported energy/);
  assert.ok(lowEnergy.whatToAvoid, "low-energy days must carry an explicit avoid-new-commitments note");
  assert.ok(lowEnergy.healthNote, "low-energy days must carry a health note");

  // Heavy meeting day (>=4) simplifies even with normal energy.
  const heavyMeetings = derivePlanShape({ isLowEnergy: false, meetingCount: 5, top3Candidates: ["Task A"], dueSoonItems: [] });
  assert.equal(heavyMeetings.simplify, true);
  assert.equal(heavyMeetings.deepWork.length, 1);
  assert.match(heavyMeetings.deepWork[0].reason, /Heavy meeting day/);

  // Exactly at the threshold (4) still counts as heavy; 3 does not.
  assert.equal(derivePlanShape({ isLowEnergy: false, meetingCount: 4, top3Candidates: [], dueSoonItems: [] }).simplify, true);
  assert.equal(derivePlanShape({ isLowEnergy: false, meetingCount: 3, top3Candidates: [], dueSoonItems: [] }).simplify, false);

  // No candidates at all -> an honest placeholder, never an empty top3 (an empty plan looks broken, not "nothing to do").
  const empty = derivePlanShape({ isLowEnergy: false, meetingCount: 0, top3Candidates: [], dueSoonItems: [] });
  assert.equal(empty.top3.length, 1);
  assert.match(empty.top3[0], /No standing priority/);

  // top3 is always capped at 3 even if more candidates are supplied.
  const overflow = derivePlanShape({ isLowEnergy: false, meetingCount: 0, top3Candidates: ["A", "B", "C", "D", "E"], dueSoonItems: [] });
  assert.equal(overflow.top3.length, 3);

  // lightTasks caps at 3 regardless of how many due-soon items exist.
  const manyDueSoon = derivePlanShape({ isLowEnergy: false, meetingCount: 0, top3Candidates: ["A"], dueSoonItems: ["1", "2", "3", "4", "5"] });
  assert.equal(manyDueSoon.lightTasks.length, 3);

  console.log("planner-rules.test.ts (owner-brain): ALL PASS (normal day, low-energy simplify, heavy-meeting simplify, threshold boundary, empty-input placeholder, caps)");
}

run();
