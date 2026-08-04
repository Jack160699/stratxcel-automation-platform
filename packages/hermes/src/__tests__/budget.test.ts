// Run with: node --experimental-strip-types packages/hermes/src/__tests__/budget.test.ts
import assert from "node:assert/strict";
import {
  assertWithinBudget,
  BudgetExceededError,
  assertContextWithinTokenCeiling,
  TokenCeilingExceededError,
  OutputTokenTracker,
} from "../budget.ts";
import type { MissionScopedContext } from "../types.ts";

function run() {
  const context: MissionScopedContext = {
    missionId: "m1",
    tenantId: "t1",
    goalText: "do something",
    serviceKey: null,
    hermesProfile: null,
    brandBrainVersion: null,
    brandBrain: null,
    budgetCents: 1000,
    allowedTools: [],
  };

  assert.doesNotThrow(() => assertWithinBudget(context, 500, 400));
  assert.throws(() => assertWithinBudget(context, 500, 600), BudgetExceededError);

  // Preflight: a small brief/context stays under the default ceiling.
  assert.doesNotThrow(() => assertContextWithinTokenCeiling("m1", "a short mission brief", { foo: "bar" }, "content"));

  // Preflight: reproduces the observed incident shape — an oversized
  // context (well beyond ~20k tokens even after the 1.5x research
  // multiplier) is refused before submission, not paid for.
  const hugeContext = { brandBrain: "x".repeat(400_000) };
  assert.throws(() => assertContextWithinTokenCeiling("m1", "trivial goal", hugeContext, "research"), TokenCeilingExceededError);

  // A profile with a smaller multiplier (crm: 0.5x) trips at a lower size
  // than one with a larger multiplier (research: 1.5x), for the same payload.
  const mediumContext = { note: "x".repeat(50_000) };
  let crmThrew = false;
  try {
    assertContextWithinTokenCeiling("m1", "goal", mediumContext, "crm");
  } catch (err) {
    crmThrew = err instanceof TokenCeilingExceededError;
  }
  assert.doesNotThrow(() => assertContextWithinTokenCeiling("m1", "goal", mediumContext, "research"));
  assert.equal(crmThrew, true);

  // OutputTokenTracker: accumulates and reports exceeded once past ceiling.
  const tracker = new OutputTokenTracker(10); // ceiling of 10 estimated tokens (~40 chars)
  assert.equal(tracker.exceeded, false);
  tracker.accumulate("short");
  assert.equal(tracker.exceeded, false);
  tracker.accumulate("x".repeat(100));
  assert.equal(tracker.exceeded, true);
  assert.ok(tracker.estimated > 10);

  console.log("budget.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
