// Pure, dependency-free package-scheduling math (mirrors activity-labels.ts
// / publish-outcome-classify.ts) — no Supabase, no network, fully unit
// testable. Turns "N remaining posts, M remaining days, this many per day,
// these platforms, this timezone" into a deterministic list of future
// slots. Never invented — every slot is a real, explainable computation
// from real inputs (period window, entitlement remainder, connected
// destinations).

/**
 * Converts a local wall-clock time in an IANA timezone to a real UTC
 * instant, using only Intl.DateTimeFormat (no new dependency). DST-correct:
 * the offset is derived from what the timezone actually reports for the
 * computed instant, not a fixed UTC offset table.
 */
export function zonedWallTimeToUtcIso(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): string {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Iterate once so DST transitions near the wall time resolve to the
  // offset that actually applies at the resulting UTC instant.
  let utcMs = asIfUtc - tzOffsetMsAt(asIfUtc, timeZone);
  utcMs = asIfUtc - tzOffsetMsAt(utcMs, timeZone);
  return new Date(utcMs).toISOString();
}

/** Break a stored UTC instant into wall-clock parts in an IANA package timezone (browser TZ irrelevant). */
export function utcIsoToZonedWallParts(iso: string, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** `datetime-local` value (`YYYY-MM-DDTHH:mm`) for a UTC instant shown in the package timezone. */
export function utcIsoToDatetimeLocalValue(iso: string, timeZone: string): string {
  const wall = utcIsoToZonedWallParts(iso, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/**
 * Convert a package-timezone wall clock from `datetime-local` into stored UTC.
 * Never uses the browser's local timezone — only the package IANA zone.
 */
export function datetimeLocalValueToUtcIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("invalid_schedule_wall_time");
  return zonedWallTimeToUtcIso(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), timeZone);
}

function tzOffsetMsAt(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  // What the wall clock reads in `timeZone` for this UTC instant.
  const asUtcAgain = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtcAgain - utcMs;
}

/** A calendar day, in the given timezone, expressed as (year, month, day). */
function zonedCalendarDay(utcMs: number, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function addCalendarDays(day: { year: number; month: number; day: number }, count: number): { year: number; month: number; day: number } {
  // UTC-noon arithmetic avoids any DST edge affecting the calendar-day count itself.
  const base = Date.UTC(day.year, day.month - 1, day.day, 12, 0, 0);
  const shifted = new Date(base + count * 86_400_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export interface DistributionInput {
  /** Queue items already planned for the current service period (any status). */
  existingCount: number;
  /** Total entitled units for the current service period. */
  targetUnits: number;
  now: Date;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  maxPostsPerDay: number;
  /** Connected, allowed-platform destinations to round-robin across. Empty means nothing can be planned. */
  platforms: string[];
  /** Local hour:minute each post defaults to, when not otherwise specified. */
  timeOfDay?: { hour: number; minute: number };
}

export interface DistributionSlot {
  sequence: number;
  scheduledAt: string;
  platform: string;
}

export interface DistributionResult {
  slots: DistributionSlot[];
  /** Set when the remaining entitlement cannot safely fit the remaining window at maxPostsPerDay — the caller should mark the package NEEDS ATTENTION rather than silently under-deliver or burst-publish. */
  blockedReason?: "period_window_elapsed" | "insufficient_window_for_remaining_entitlement" | "no_connected_destination";
}

/**
 * Distributes the entitlement remainder evenly across the remaining valid
 * days in the service period, respecting maxPostsPerDay. Never dumps
 * everything on day one (Section 19) and never proposes more than the
 * window can safely hold (Section 19/20) — when it can't fit, it returns
 * only what DOES safely fit plus a blocked reason, instead of spam-posting
 * or silently dropping the shortfall.
 */
export function computePackageDistribution(input: DistributionInput): DistributionResult {
  const remaining = input.targetUnits - input.existingCount;
  if (remaining <= 0) return { slots: [] };
  if (input.platforms.length === 0) return { slots: [], blockedReason: "no_connected_destination" };

  const windowStartMs = Math.max(input.now.getTime(), input.periodStart.getTime());
  const windowEndMs = input.periodEnd.getTime();
  if (windowEndMs <= windowStartMs) return { slots: [], blockedReason: "period_window_elapsed" };

  const startDay = zonedCalendarDay(windowStartMs, input.timezone);
  const endDay = zonedCalendarDay(windowEndMs, input.timezone);
  const startDayMs = Date.UTC(startDay.year, startDay.month - 1, startDay.day, 12, 0, 0);
  const endDayMs = Date.UTC(endDay.year, endDay.month - 1, endDay.day, 12, 0, 0);
  const daysAvailable = Math.max(1, Math.round((endDayMs - startDayMs) / 86_400_000) + 1);

  const capacity = daysAvailable * input.maxPostsPerDay;
  const plannable = Math.min(remaining, capacity);
  const blockedReason = remaining > capacity ? "insufficient_window_for_remaining_entitlement" : undefined;

  const { hour, minute } = input.timeOfDay ?? { hour: 10, minute: 30 };
  // Even spread: ceil(plannable / daysAvailable) per active day, filling
  // from the earliest day forward, never exceeding maxPostsPerDay.
  const perDay = Math.min(input.maxPostsPerDay, Math.ceil(plannable / daysAvailable));

  const slots: DistributionSlot[] = [];
  let sequence = input.existingCount + 1;
  let dayCursor = startDay;
  let placedToday = 0;
  let dayIndex = 0;
  while (slots.length < plannable && dayIndex < daysAvailable) {
    if (placedToday >= perDay) {
      dayIndex += 1;
      dayCursor = addCalendarDays(startDay, dayIndex);
      placedToday = 0;
      continue;
    }
    const scheduledAt = zonedWallTimeToUtcIso(dayCursor.year, dayCursor.month, dayCursor.day, hour, minute, input.timezone);
    // Never schedule a slot before the actual planning moment on day 0 —
    // push same-day posts to the next available multiple of the time slot.
    const candidateMs = new Date(scheduledAt).getTime();
    if (candidateMs < input.now.getTime() && dayIndex === 0) {
      placedToday = perDay; // this exact time already passed today; move to the next day
      continue;
    }
    slots.push({ sequence, scheduledAt, platform: input.platforms[(sequence - 1) % input.platforms.length] });
    sequence += 1;
    placedToday += 1;
  }

  return { slots, blockedReason };
}
