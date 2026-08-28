import assert from "node:assert/strict";
import {
  upcomingObservances,
  seasonalTagForDate,
  seasonalContextLine,
  resolveFestivalDate,
  listFestivalsForRange,
} from "../festival-calendar.ts";

async function runTests() {
  console.log("Starting Festival Calendar Comprehensive Test Suite...");

  // 1. Fixed-date observances
  {
    const results = upcomingObservances(new Date("2026-01-20T00:00:00.000Z"), 10);
    const names = results.map((o) => o.name);
    assert.ok(names.includes("Republic Day"));
    const rep = results.find((o) => o.name === "Republic Day")!;
    assert.equal(rep.date, "2026-01-26");
    assert.equal(rep.daysAway, 6);
  }
  console.log("upcomingObservances: fixed-date observance found with correct date/daysAway — PASS");

  // 2. Nth weekday of month rule
  {
    const mothersDay = upcomingObservances(new Date("2026-05-01T00:00:00.000Z"), 20).find((o) => o.name === "Mother's Day");
    assert.ok(mothersDay);
    const resolvedDate = new Date(`${mothersDay!.date}T00:00:00.000Z`);
    assert.equal(resolvedDate.getUTCDay(), 0);
  }
  console.log("upcomingObservances: nthWeekday rule (Mother's Day) resolves correctly — PASS");

  // 3. Multi-year resolveFestivalDate across leap and non-leap years
  {
    const rep2025 = resolveFestivalDate("republic_day", 2025);
    const rep2028 = resolveFestivalDate("republic_day", 2028); // Leap year
    assert.equal(rep2025?.dateIso, "2025-01-26");
    assert.equal(rep2028?.dateIso, "2028-01-26");
    assert.equal(rep2025?.calculationMethod, "fixed_gregorian");
  }
  console.log("resolveFestivalDate: multi-year fixed dates — PASS");

  // 4. Dynamic Lunar Panchangam festival shifts (Diwali 2025-2028)
  {
    const diwali2025 = resolveFestivalDate("diwali", 2025);
    const diwali2026 = resolveFestivalDate("diwali", 2026);
    const diwali2027 = resolveFestivalDate("diwali", 2027);
    const diwali2028 = resolveFestivalDate("diwali", 2028);
    assert.equal(diwali2025?.dateIso, "2025-10-20");
    assert.equal(diwali2026?.dateIso, "2026-11-08");
    assert.equal(diwali2027?.dateIso, "2027-10-29");
    assert.equal(diwali2028?.dateIso, "2028-10-17");
  }
  console.log("resolveFestivalDate: multi-year lunar shifts — PASS");

  // 5. Tenant manual override precedence & provenance
  {
    const overriddenHoli2026 = resolveFestivalDate("holi", 2026, "2026-03-05", "Local temple trust observance");
    assert.equal(overriddenHoli2026?.dateIso, "2026-03-05");
    assert.equal(overriddenHoli2026?.isManualOverride, true);
    assert.equal(overriddenHoli2026?.overrideNotes, "Local temple trust observance");
  }
  console.log("resolveFestivalDate: tenant manual override precedence — PASS");

  // 6. Seasonal context line
  {
    const line = seasonalContextLine(new Date("2026-11-01T00:00:00.000Z"), 10);
    assert.ok(line.includes("Diwali"));
  }
  console.log("seasonalContextLine: formatted output — PASS");

  console.log("=================================================");
  console.log("ALL FESTIVAL CALENDAR TEST SUITE ASSERTIONS PASS ✔");
  console.log("=================================================");
}

runTests();
