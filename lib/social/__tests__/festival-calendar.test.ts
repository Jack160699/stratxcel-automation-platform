// Hermes-Orchestrated Content Engine Hardening mission Section 2 — the
// real, deterministic festival/season calendar. Pure module, no Supabase,
// no network — fully live-tested, unlike package-autopilot.ts itself
// (see package-acceptance-final.test.ts's own header comment on why that
// file uses source-inclusion checks instead).
// Run with: node --experimental-strip-types lib/social/__tests__/festival-calendar.test.ts
import assert from "node:assert/strict";
import { upcomingObservances, seasonalTagForDate, seasonalContextLine } from "../festival-calendar.ts";

function run() {
  // --- Fixed-date observances are 100% deterministic, any year ----------
  {
    const results = upcomingObservances(new Date("2026-01-20T00:00:00.000Z"), 10);
    const names = results.map((o) => o.name);
    assert.ok(names.includes("Republic Day"), "Republic Day (26 Jan) must be found within a 10-day window from 20 Jan");
    const republicDay = results.find((o) => o.name === "Republic Day")!;
    assert.equal(republicDay.date, "2026-01-26");
    assert.equal(republicDay.daysAway, 6);
  }
  console.log("upcomingObservances: fixed-date observance found with correct date/daysAway — PASS");

  // --- "Nth weekday of month" rules resolve to real, correct dates ------
  {
    // Mother's Day 2026 = 2nd Sunday of May. 3 May 2026 is a Sunday, so the
    // 2nd Sunday is 10 May 2026 — verified by direct weekday computation,
    // not asserted from memory.
    const mothersDay = upcomingObservances(new Date("2026-05-01T00:00:00.000Z"), 20).find((o) => o.name === "Mother's Day");
    assert.ok(mothersDay, "Mother's Day must resolve from the nthWeekday rule");
    const resolvedDate = new Date(`${mothersDay!.date}T00:00:00.000Z`);
    assert.equal(resolvedDate.getUTCDay(), 0, "Mother's Day must fall on a Sunday");
    // Confirm it's genuinely the 2nd Sunday: exactly one earlier Sunday in May.
    const may1Weekday = new Date("2026-05-01T00:00:00.000Z").getUTCDay();
    const firstSundayDate = 1 + ((7 - may1Weekday) % 7);
    const secondSundayDate = firstSundayDate + 7;
    assert.equal(resolvedDate.getUTCDate(), secondSundayDate, "must be exactly the 2nd Sunday of May, computed independently");
  }
  console.log("upcomingObservances: nthWeekday rule (Mother's Day) resolves correctly and independently-verified — PASS");

  // --- Never fabricates a lunar-festival date outside the verified table -
  {
    // 2099 has no verified entries at all — the module must return nothing
    // for lunar festivals rather than guess/approximate one.
    const results = upcomingObservances(new Date("2099-10-01T00:00:00.000Z"), 60);
    assert.ok(!results.some((o) => o.name === "Diwali"), "an unverified year must never produce a guessed Diwali date");
    // Fixed-date observances still work for any year, including 2099.
    assert.ok(results.some((o) => o.name === "Gandhi Jayanti"), "fixed-date observances must still resolve for any year");
  }
  console.log("upcomingObservances: never fabricates a lunar festival date for an unverified year — PASS");

  // --- Verified 2026 lunar entry is found within its window -------------
  {
    const results = upcomingObservances(new Date("2026-11-01T00:00:00.000Z"), 10);
    const diwali = results.find((o) => o.name === "Diwali");
    assert.ok(diwali, "the verified 2026 Diwali entry must be found within a 10-day window from 1 Nov");
    assert.equal(diwali!.date, "2026-11-08");
  }
  console.log("upcomingObservances: verified 2026 lunar entry found correctly — PASS");

  // --- Window boundary is respected (exclusive of the far end) ----------
  {
    const justOutside = upcomingObservances(new Date("2026-01-01T00:00:00.000Z"), 25); // Republic Day is 25 days away
    assert.ok(!justOutside.some((o) => o.name === "Republic Day"), "an observance exactly at the window edge must be excluded (daysAway < windowDays, not <=)");
    const justInside = upcomingObservances(new Date("2026-01-01T00:00:00.000Z"), 26);
    assert.ok(justInside.some((o) => o.name === "Republic Day"), "an observance just inside the window must be included");
  }
  console.log("upcomingObservances: window boundary is exclusive and correct — PASS");

  // --- Past observances never appear ---------------------------------
  {
    const results = upcomingObservances(new Date("2026-02-01T00:00:00.000Z"), 10);
    assert.ok(!results.some((o) => o.name === "Republic Day"), "an observance that already passed must never appear as 'upcoming'");
  }
  console.log("upcomingObservances: past observances excluded — PASS");

  // --- Year-boundary rollover: New Year's Day found from late December --
  {
    const results = upcomingObservances(new Date("2026-12-28T00:00:00.000Z"), 10);
    const newYear = results.find((o) => o.name === "New Year's Day");
    assert.ok(newYear, "New Year's Day must be found across the year boundary");
    assert.equal(newYear!.date, "2027-01-01");
  }
  console.log("upcomingObservances: correctly rolls over the year boundary — PASS");

  // --- Seasonal tag is always a real, non-empty string for every month --
  {
    for (let month = 1; month <= 12; month++) {
      const tag = seasonalTagForDate(new Date(Date.UTC(2026, month - 1, 15)));
      assert.ok(tag.length > 0, `month ${month} must have a real seasonal tag`);
    }
  }
  console.log("seasonalTagForDate: every month has a real tag — PASS");

  // --- seasonalContextLine: null when genuinely nothing to say ----------
  {
    // A window and date chosen so nothing fixed or verified-lunar falls
    // inside it (season tag still always applies, so this really tests
    // that the observance-mentioning branch is the one omitted correctly)
    const line = seasonalContextLine(new Date("2026-01-05T00:00:00.000Z"), 1);
    assert.ok(line, "seasonalTag alone still produces a real line");
    assert.ok(!/Upcoming occasion/.test(line!), "with nothing in-window, the occasion clause must be omitted, not fabricated");
  }
  console.log("seasonalContextLine: omits the occasion clause when nothing is genuinely upcoming — PASS");

  // --- seasonalContextLine: real content when something IS upcoming -----
  {
    const line = seasonalContextLine(new Date("2026-08-25T00:00:00.000Z"), 7);
    assert.ok(line, "must produce a real line");
    assert.ok(/Raksha Bandhan/.test(line!), "must mention the real verified upcoming festival");
    assert.ok(/Current season/.test(line!), "must also include the season tag");
  }
  console.log("seasonalContextLine: real occasion + season both present when genuinely upcoming — PASS");

  console.log("festival-calendar.test.ts: ALL PASS");
}

run();
