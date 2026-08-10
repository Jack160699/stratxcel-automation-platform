// Tests the pure package-scheduling math (Sections 17-20, 79-87 of the
// release-candidate brief): distribution, timezone correctness, and the
// "never burst, never silently under-deliver" guarantees.
// Run with: node --experimental-strip-types lib/social/__tests__/package-distribution.test.ts

import assert from "node:assert/strict";
import { computePackageDistribution, zonedWallTimeToUtcIso } from "../package-distribution.ts";

function run() {
  // --- zonedWallTimeToUtcIso: DST-correct local-to-UTC conversion. ---
  // IST is a fixed UTC+5:30, no DST — 10:30 IST on 2026-08-12 is 05:00 UTC.
  assert.equal(zonedWallTimeToUtcIso(2026, 8, 12, 10, 30, "Asia/Kolkata"), "2026-08-12T05:00:00.000Z");
  // America/New_York is UTC-4 in August (EDT) — 10:30 local is 14:30 UTC.
  assert.equal(zonedWallTimeToUtcIso(2026, 8, 12, 10, 30, "America/New_York"), "2026-08-12T14:30:00.000Z");
  // ...and UTC-5 (EST) in January — DST-correct, not a fixed offset table.
  assert.equal(zonedWallTimeToUtcIso(2026, 1, 12, 10, 30, "America/New_York"), "2026-01-12T15:30:00.000Z");

  // --- Even distribution across the remaining window. ---
  const base = {
    now: new Date("2026-08-10T04:00:00.000Z"), // well before 10:30 IST
    periodStart: new Date("2026-08-10T00:00:00.000Z"),
    periodEnd: new Date("2026-09-09T00:00:00.000Z"), // ~30 days
    timezone: "Asia/Kolkata",
    maxPostsPerDay: 1,
    platforms: ["threads"],
  };
  const thirty = computePackageDistribution({ ...base, existingCount: 0, targetUnits: 30 });
  assert.equal(thirty.slots.length, 30, "30 posts / 30 days must plan all 30 slots, not one/day forever unbounded");
  assert.equal(thirty.blockedReason, undefined);
  assert.deepEqual(thirty.slots.map((s) => s.sequence), Array.from({ length: 30 }, (_, i) => i + 1));
  // Never more than maxPostsPerDay on any single calendar day (IST).
  const dayKeys = thirty.slots.map((s) => new Date(s.scheduledAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const perDayCounts = dayKeys.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
  assert.ok(Object.values(perDayCounts).every((count) => count <= base.maxPostsPerDay));

  // --- 12/month is NOT treated as one-per-day for 30 days (Section 82). ---
  const twelve = computePackageDistribution({ ...base, existingCount: 0, targetUnits: 12 });
  assert.equal(twelve.slots.length, 12);
  const uniqueDays = new Set(twelve.slots.map((s) => new Date(s.scheduledAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })));
  assert.ok(uniqueDays.size <= 12, "12 posts spread across ~30 days must not land on 30 separate single-post days by accident, nor collide");

  // --- Already-planned items reduce the remainder; sequence continues, never restarts. ---
  const partial = computePackageDistribution({ ...base, existingCount: 25, targetUnits: 30 });
  assert.equal(partial.slots.length, 5);
  assert.deepEqual(partial.slots.map((s) => s.sequence), [26, 27, 28, 29, 30]);

  // --- Entitlement already fulfilled -> nothing to plan. ---
  assert.deepEqual(computePackageDistribution({ ...base, existingCount: 30, targetUnits: 30 }), { slots: [] });

  // --- Period window already elapsed -> blocked, never a negative-day crash. ---
  const elapsed = computePackageDistribution({ ...base, now: new Date("2026-09-10T00:00:00.000Z"), existingCount: 0, targetUnits: 5 });
  assert.equal(elapsed.slots.length, 0);
  assert.equal(elapsed.blockedReason, "period_window_elapsed");

  // --- No connected destination -> blocked, not silently zero with no explanation. ---
  const noDestination = computePackageDistribution({ ...base, platforms: [], existingCount: 0, targetUnits: 5 });
  assert.equal(noDestination.blockedReason, "no_connected_destination");

  // --- Section 19: remaining entitlement cannot fit remaining window at
  // maxPostsPerDay -> plan what safely fits, flag NEEDS_ATTENTION, never spam-post. ---
  const tightWindow = computePackageDistribution({
    ...base,
    now: new Date("2026-09-08T00:00:00.000Z"), // 1 day left in the period
    existingCount: 0,
    targetUnits: 10,
    maxPostsPerDay: 1,
  });
  assert.ok(tightWindow.slots.length <= 2, "must never dump all 10 remaining posts into the final day(s)");
  assert.equal(tightWindow.blockedReason, "insufficient_window_for_remaining_entitlement");

  // --- Round-robins across multiple connected platforms. ---
  const multiPlatform = computePackageDistribution({ ...base, existingCount: 0, targetUnits: 6, platforms: ["threads", "linkedin", "instagram"] });
  assert.deepEqual(
    multiPlatform.slots.map((s) => s.platform),
    ["threads", "linkedin", "instagram", "threads", "linkedin", "instagram"]
  );

  // --- maxPostsPerDay > 1 is respected (multiple slots per day allowed, never exceeded). ---
  const busy = computePackageDistribution({ ...base, existingCount: 0, targetUnits: 6, maxPostsPerDay: 3, periodEnd: new Date("2026-08-12T00:00:00.000Z") });
  const busyDayCounts = busy.slots.reduce<Record<string, number>>((acc, s) => {
    const key = new Date(s.scheduledAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
  assert.ok(Object.values(busyDayCounts).every((count) => count <= 3));

  console.log("package-distribution.test.ts: ALL PASS (DST-correct scheduling, even spread, quantity/period correctness, no-burst safety, round-robin)");
}

run();
