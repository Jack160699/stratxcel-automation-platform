// Run with: node --experimental-strip-types supabase/__tests__/vercel-hobby-cron-limits.test.ts
//
// Mission D+: found live. This Vercel project is on the Hobby plan, which
// rejects ANY deployment whose vercel.json contains a cron running more
// often than once/day -- confirmed via a real deploy attempt returning
// `cron_jobs_limits_reached`. This silently blocked EVERY new deployment
// (git-push-triggered auto-deploys failed with no visible error anywhere
// in this app's own tooling; the real API error only surfaced by calling
// Vercel's deploy API directly) until every sub-daily cron was widened to
// once/day. This is a real, easy-to-silently-regress constraint: adding a
// new cron running more than once/day, or reverting one of these five back
// to its pre-Mission-D+ frequency, reintroduces the exact same silent
// deployment block. This test parses every cron in vercel.json and fails
// loudly if any of them would violate the Hobby-plan limit, rather than
// letting the next person discover it the same way this mission did.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const vercelConfig = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

/** A cron schedule is "at most once/day" iff every field finer than
 * day-of-month is a single fixed value (no `*`, no `/step`, no lists/ranges)
 * -- i.e. the minute and hour fields are literal numbers, and day-of-month/
 * month/day-of-week may still use wildcards (they only coarsen further,
 * they never add more-than-daily runs). This is deliberately conservative:
 * it only recognizes the "0 H * * *" / "M H * * *" shape this file
 * actually uses, and flags anything it can't prove is safe. */
function isAtMostOncePerDay(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour] = fields;
  const isFixedField = (f: string) => /^\d+$/.test(f);
  return isFixedField(minute) && isFixedField(hour);
}

function run() {
  assert.ok(Array.isArray(vercelConfig.crons) && vercelConfig.crons.length > 0, "vercel.json must define at least the real crons this app depends on");

  const violations = vercelConfig.crons.filter((c) => !isAtMostOncePerDay(c.schedule));
  assert.deepEqual(
    violations,
    [],
    `Hobby-plan cron limit violated by: ${violations.map((c) => `${c.path} (${c.schedule})`).join(", ")} -- ` +
      `the Vercel project is on the Hobby plan, which rejects deploying ANY cron more frequent than once/day ` +
      `(confirmed live: API error cron_jobs_limits_reached). This blocks EVERY deployment silently -- fix the ` +
      `schedule to a fixed once-daily time, or confirm the plan has been upgraded past Hobby and update this test.`
  );
  console.log(`vercel.json: all ${vercelConfig.crons.length} crons are Hobby-plan-compatible (at most once/day) — PASS`);

  // The two Social Autopilot crons specifically, since their relative
  // ordering matters for real same-day pickup.
  const producer = vercelConfig.crons.find((c) => c.path === "/api/social/package-producer");
  const worker = vercelConfig.crons.find((c) => c.path === "/api/social/worker");
  assert.ok(producer && worker, "both real Social Autopilot crons must still be present");
  const hourOf = (schedule: string) => Number(schedule.trim().split(/\s+/)[1]);
  assert.ok(hourOf(producer!.schedule) < hourOf(worker!.schedule), "package-producer must run before worker on the same day, so same-day-prepared content can still be published same day");
  console.log("vercel.json: package-producer runs before worker (same-day content can still be published same day) — PASS");

  console.log("vercel-hobby-cron-limits.test.ts: ALL PASS");
}

run();
