import assert from "node:assert/strict";
import {
  datetimeLocalValueToUtcIso,
  utcIsoToDatetimeLocalValue,
  utcIsoToZonedWallParts,
  zonedWallTimeToUtcIso,
} from "../package-distribution.ts";

function run() {
  // --- Asia/Kolkata (IST, no DST): round-trip must not shift wall clock. ---
  const istUtc = "2026-08-12T05:00:00.000Z"; // 10:30 IST
  assert.equal(utcIsoToDatetimeLocalValue(istUtc, "Asia/Kolkata"), "2026-08-12T10:30");
  assert.equal(datetimeLocalValueToUtcIso("2026-08-12T10:30", "Asia/Kolkata"), istUtc);
  assert.deepEqual(utcIsoToZonedWallParts(istUtc, "Asia/Kolkata"), {
    year: 2026,
    month: 8,
    day: 12,
    hour: 10,
    minute: 30,
  });
  // Editing the same wall time in package TZ re-stores the same UTC (no shift).
  const istWall = utcIsoToDatetimeLocalValue(istUtc, "Asia/Kolkata");
  assert.equal(datetimeLocalValueToUtcIso(istWall, "Asia/Kolkata"), istUtc, "IST reschedule no shift");

  // --- America/New_York DST: EDT (Aug) vs EST (Jan). ---
  assert.equal(zonedWallTimeToUtcIso(2026, 8, 12, 10, 30, "America/New_York"), "2026-08-12T14:30:00.000Z");
  assert.equal(zonedWallTimeToUtcIso(2026, 1, 12, 10, 30, "America/New_York"), "2026-01-12T15:30:00.000Z");

  const edtUtc = "2026-08-12T14:30:00.000Z";
  assert.equal(utcIsoToDatetimeLocalValue(edtUtc, "America/New_York"), "2026-08-12T10:30");
  assert.equal(datetimeLocalValueToUtcIso("2026-08-12T10:30", "America/New_York"), edtUtc);

  const estUtc = "2026-01-12T15:30:00.000Z";
  assert.equal(utcIsoToDatetimeLocalValue(estUtc, "America/New_York"), "2026-01-12T10:30");
  assert.equal(datetimeLocalValueToUtcIso("2026-01-12T10:30", "America/New_York"), estUtc);

  // Reschedule across DST boundary keeps intended NY wall time.
  const springWall = "2026-03-08T10:30"; // US spring forward weekend (2026-03-08)
  const springUtc = datetimeLocalValueToUtcIso(springWall, "America/New_York");
  assert.equal(utcIsoToDatetimeLocalValue(springUtc, "America/New_York"), springWall);

  const fallWall = "2026-11-01T10:30"; // US fall back weekend
  const fallUtc = datetimeLocalValueToUtcIso(fallWall, "America/New_York");
  assert.equal(utcIsoToDatetimeLocalValue(fallUtc, "America/New_York"), fallWall);

  // --- Browser timezone is irrelevant: conversion uses only the package IANA zone. ---
  // Same wall-clock string maps to different UTC instants per package timezone;
  // neither path consults the host/browser local zone.
  const packageWall = "2026-08-12T10:30";
  const fromIst = datetimeLocalValueToUtcIso(packageWall, "Asia/Kolkata");
  const fromNy = datetimeLocalValueToUtcIso(packageWall, "America/New_York");
  const fromLa = datetimeLocalValueToUtcIso(packageWall, "America/Los_Angeles");
  assert.equal(fromIst, "2026-08-12T05:00:00.000Z");
  assert.equal(fromNy, "2026-08-12T14:30:00.000Z");
  assert.equal(fromLa, "2026-08-12T17:30:00.000Z");
  assert.notEqual(fromIst, fromNy);
  assert.notEqual(fromNy, fromLa);
  // Round-trip remains stable for each package zone (host TZ cannot leak in).
  assert.equal(utcIsoToDatetimeLocalValue(fromIst, "Asia/Kolkata"), packageWall);
  assert.equal(utcIsoToDatetimeLocalValue(fromNy, "America/New_York"), packageWall);
  assert.equal(utcIsoToDatetimeLocalValue(fromLa, "America/Los_Angeles"), packageWall);

  // Invalid wall strings fail closed.
  assert.throws(() => datetimeLocalValueToUtcIso("not-a-datetime", "Asia/Kolkata"), /invalid_schedule_wall_time/);
  assert.throws(() => datetimeLocalValueToUtcIso("2026-08-12 10:30", "Asia/Kolkata"), /invalid_schedule_wall_time/);

  console.log("package-timezone-reschedule.test.ts: ALL PASS");
}

run();
