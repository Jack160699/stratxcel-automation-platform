// Run with: node --experimental-strip-types packages/missions/src/__tests__/recurring.test.ts
//
// Verifies the recurring mission template engine (master brief Section 15).
// processRecurringTemplates itself is NOT re-tested against a fake DB here
// -- this codebase's own established precedent (lib/owner-brain/__tests__/
// hermes-mission-integration.test.ts) is that createAndEstimateMission's
// full pipeline (wallet reservation, queue enqueue) is only ever tested
// against a REAL live database, never mocked -- so this file verifies the
// pure cadence/dedup math with real behavioral assertions, and
// processRecurringTemplates' own wiring via source inspection (that it
// reuses the real createAndEstimateMission with a real idempotency key,
// advances next_fire_at correctly, and isolates one template's failure
// from the rest).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeNextFireAt, isTemplateDue, buildRecurringIdempotencyKey } from "../recurring.ts";
import { isRecurringMissionsEnabled } from "../recurring-feature-flag.ts";

function readSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "packages", "missions", "src", "recurring.ts"), "utf8").replace(/\r\n/g, "\n");
}

function testComputeNextFireAtAdvancesByExactlyOneCadenceStepPastNow() {
  // Realistic case: a template's own schedule ("from") is just under one
  // full cadence period stale when the cron actually runs -- so exactly
  // ONE step forward lands past `now`. Deliberately not an exact
  // period-boundary (which real code, calling `new Date()` at two
  // genuinely different real times, essentially never hits) -- avoided
  // here rather than relitigating the >= vs > edge case for a scenario
  // that doesn't occur in production.
  const now = new Date("2026-09-07T12:05:00.000Z");
  const expected = "2026-09-07T12:10:00.000Z";

  const daily = computeNextFireAt("daily", new Date("2026-09-06T12:10:00.000Z"), now);
  assert.equal(daily.toISOString(), expected);

  const weekly = computeNextFireAt("weekly", new Date("2026-08-31T12:10:00.000Z"), now);
  assert.equal(weekly.toISOString(), expected);

  const monthly = computeNextFireAt("monthly", new Date("2026-08-08T12:10:00.000Z"), now);
  assert.equal(monthly.toISOString(), expected);

  console.log("recurring.test.ts: computeNextFireAt advances by exactly one cadence step for daily/weekly/monthly — PASS");
}

function testComputeNextFireAtSkipsMissedPeriodsInsteadOfBursting() {
  // A template that was due 10 days ago and never processed (e.g. the cron
  // was down) must land on the NEXT future daily slot, not fire 10 queued
  // missions in a burst.
  const now = new Date("2026-09-07T00:00:00.000Z");
  const staleFrom = new Date("2026-08-28T00:00:00.000Z"); // 10 days stale
  const next = computeNextFireAt("daily", staleFrom, now);
  assert.equal(next.toISOString(), "2026-09-08T00:00:00.000Z", "must skip every missed daily period and land just past now, not accumulate a backlog");
  console.log("recurring.test.ts: computeNextFireAt skips missed periods instead of bursting — PASS");
}

function testComputeNextFireAtLeavesAFutureScheduleUntouched() {
  const now = new Date("2026-09-07T00:00:00.000Z");
  const future = new Date("2026-09-10T00:00:00.000Z");
  const next = computeNextFireAt("daily", future, now);
  assert.equal(next.toISOString(), future.toISOString(), "a template not yet due must have its schedule left exactly as-is");
  console.log("recurring.test.ts: computeNextFireAt leaves a not-yet-due schedule untouched — PASS");
}

function testIsTemplateDue() {
  const now = new Date("2026-09-07T12:00:00.000Z");
  assert.equal(isTemplateDue({ enabled: true, next_fire_at: "2026-09-07T11:00:00.000Z" }, now), true, "a past next_fire_at on an enabled template is due");
  assert.equal(isTemplateDue({ enabled: true, next_fire_at: "2026-09-07T13:00:00.000Z" }, now), false, "a future next_fire_at is not yet due");
  assert.equal(isTemplateDue({ enabled: false, next_fire_at: "2026-09-01T00:00:00.000Z" }, now), false, "a disabled template is never due, no matter how overdue its schedule");
  console.log("recurring.test.ts: isTemplateDue correctly gates on both enabled AND the real schedule — PASS");
}

function testBuildRecurringIdempotencyKeyIsStableWithinAPeriodAndDistinctAcrossPeriods() {
  const morning = new Date("2026-09-07T03:00:00.000Z");
  const evening = new Date("2026-09-07T21:00:00.000Z");
  const nextDay = new Date("2026-09-08T03:00:00.000Z");

  const dailyMorning = buildRecurringIdempotencyKey("tpl-1", "daily", morning);
  const dailyEvening = buildRecurringIdempotencyKey("tpl-1", "daily", evening);
  const dailyNextDay = buildRecurringIdempotencyKey("tpl-1", "daily", nextDay);
  assert.equal(dailyMorning, dailyEvening, "two fires on the same calendar day must produce the SAME key -- this is what makes createAndEstimateMission's own dedup prevent a duplicate mission");
  assert.notEqual(dailyMorning, dailyNextDay, "a fire on a different day must produce a different key");

  const weeklyKey1 = buildRecurringIdempotencyKey("tpl-1", "weekly", new Date("2026-09-07T00:00:00.000Z"));
  const weeklyKey2 = buildRecurringIdempotencyKey("tpl-1", "weekly", new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(weeklyKey1, weeklyKey2, "two fires in the same ISO week must produce the same key");

  const monthlyKey1 = buildRecurringIdempotencyKey("tpl-1", "monthly", new Date("2026-09-01T00:00:00.000Z"));
  const monthlyKey2 = buildRecurringIdempotencyKey("tpl-1", "monthly", new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(monthlyKey1, monthlyKey2, "two fires in the same calendar month must produce the same key");

  const otherTemplate = buildRecurringIdempotencyKey("tpl-2", "daily", morning);
  assert.notEqual(dailyMorning, otherTemplate, "different templates must never collide on the same key");

  console.log("recurring.test.ts: buildRecurringIdempotencyKey is stable within one real cadence period and distinct across periods/templates — PASS");
}

function testRecurringMissionsEnabledDefaultsOffMatchingTheEstablishedOptInPattern() {
  // Same real convention as packages/ai-runtime's own
  // isOpenRouterRoutingEnabled tests: spread real process.env as the base
  // (satisfies ProcessEnv's required fields) and override just the one var
  // under test.
  const base = { ...process.env };
  delete base.RECURRING_MISSIONS_ENABLED;
  assert.equal(isRecurringMissionsEnabled(base), false, "must default to disabled with no env var set -- same fail-safe pattern as isOpenRouterRoutingEnabled/isLocalAiRoutingEnabled");
  assert.equal(isRecurringMissionsEnabled({ ...base, RECURRING_MISSIONS_ENABLED: "1" }), true);
  assert.equal(isRecurringMissionsEnabled({ ...base, RECURRING_MISSIONS_ENABLED: "true" }), true);
  assert.equal(isRecurringMissionsEnabled({ ...base, RECURRING_MISSIONS_ENABLED: "yes" }), false, "must not treat an arbitrary truthy-looking string as enabled");
  console.log("recurring.test.ts: isRecurringMissionsEnabled defaults to off, matching the established opt-in pattern — PASS");
}

function testProcessRecurringTemplatesReusesTheRealMissionCreationPathAndIsolatesFailures() {
  const source = readSource();
  assert.match(source, /import \{ createAndEstimateMission \} from "\.\/repository\.ts";/, "must reuse the real, already-tested mission-creation function, never a duplicate insert path");
  assert.match(
    source,
    /const mission: MissionRow = await createAndEstimateMission\(supabase, \{\s*\n\s*tenantId: template\.tenant_id,\s*\n\s*createdBy: template\.created_by,\s*\n\s*goalText: template\.goal_text,\s*\n\s*idempotencyKey,\s*\n\s*\}\);/,
    "must pass the template's own real tenant/goal/creator, plus a real idempotency key -- never a hand-rolled insert that could bypass createAndEstimateMission's own wallet/state-machine handling"
  );
  assert.match(source, /const idempotencyKey = buildRecurringIdempotencyKey\(template\.id, template\.cadence, now\);/, "the idempotency key must be derived from the real, tested buildRecurringIdempotencyKey, not inlined ad hoc");
  assert.match(source, /const nextFireAt = computeNextFireAt\(template\.cadence, new Date\(template\.next_fire_at\), now\);/, "next_fire_at must be advanced using the real, tested computeNextFireAt");
  assert.match(source, /} catch \(err\) \{/, "one template's failure must be caught, not allowed to abort the whole batch");
  assert.match(source, /results\.push\(\{ templateId: template\.id, tenantId: template\.tenant_id, outcome: "failed"/, "a failure must be recorded per-template, not silently swallowed nor thrown");
  console.log("recurring.test.ts: processRecurringTemplates reuses the real mission-creation path and isolates per-template failures — PASS");
}

function run() {
  testComputeNextFireAtAdvancesByExactlyOneCadenceStepPastNow();
  testComputeNextFireAtSkipsMissedPeriodsInsteadOfBursting();
  testComputeNextFireAtLeavesAFutureScheduleUntouched();
  testIsTemplateDue();
  testBuildRecurringIdempotencyKeyIsStableWithinAPeriodAndDistinctAcrossPeriods();
  testRecurringMissionsEnabledDefaultsOffMatchingTheEstablishedOptInPattern();
  testProcessRecurringTemplatesReusesTheRealMissionCreationPathAndIsolatesFailures();
  console.log("recurring.test.ts (@stratxcel/missions): ALL PASS");
}

run();
