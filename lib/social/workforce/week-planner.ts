/**
 * Deterministic weekly schedule planner for Social Copilot / Package Autopilot.
 * Language models must NOT invent ISO timestamps for "plan this week".
 */

import {
  utcIsoToDatetimeLocalValue,
  zonedWallTimeToUtcIso,
} from "../package-distribution.ts";
import { buildScheduleIntent, SocialScheduleError } from "./schedule.ts";
import type { ScheduleIntent } from "./types.ts";

export type ScheduleSource =
  | "USER_SPECIFIED"
  | "TENANT_PREFERENCE"
  | "PACKAGE_PLAN"
  | "SYSTEM_DEFAULT";

/**
 * Default weekly slot policy (hour:minute local) when no tenant preference exists.
 * Spread across remaining weekdays; weekends used only when weekdays are exhausted.
 */
export const DEFAULT_WEEKLY_SLOT_POLICY = {
  weekdayHours: [10, 13, 17] as const,
  weekendHours: [11] as const,
  minute: 0,
  /** Monday = 1 … Sunday = 7 (ISO). */
  preferWeekdays: true,
} as const;

export interface PlannedWeekSlot {
  scheduledAtIso: string;
  timeZone: string;
  wallClockLabel: string;
  scheduleSource: ScheduleSource;
  scheduleIntent: ScheduleIntent;
  localYear: number;
  localMonth: number;
  localDay: number;
  localHour: number;
  localMinute: number;
}

export interface WeekPlanInput {
  timeZone: string;
  /** Current instant (UTC ISO). Defaults to now. */
  nowIso?: string;
  itemCount: number;
  /** Optional preferred local hours (0-23). */
  preferredHours?: readonly number[];
  scheduleSource?: ScheduleSource;
  /** Inclusive start override; default = current local calendar day. */
  rangeStartLocalDate?: { year: number; month: number; day: number };
  /** Inclusive end override; default = Sunday of the current local week. */
  rangeEndLocalDate?: { year: number; month: number; day: number };
}

export class WeekPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeekPlanError";
  }
}

function zonedParts(iso: string, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? "Mon"] ?? 1,
  };
}

function addDays(day: { year: number; month: number; day: number }, count: number) {
  const base = Date.UTC(day.year, day.month - 1, day.day, 12, 0, 0);
  const shifted = new Date(base + count * 86_400_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function compareDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function isoWeekday(day: { year: number; month: number; day: number }, timeZone: string): number {
  const noonIso = zonedWallTimeToUtcIso(day.year, day.month, day.day, 12, 0, timeZone);
  return zonedParts(noonIso, timeZone).weekday;
}

/** Resolve "this week" in the tenant timezone: from today through Sunday (inclusive). */
export function resolveThisWeekRange(timeZone: string, nowIso?: string): {
  start: { year: number; month: number; day: number };
  end: { year: number; month: number; day: number };
  nowParts: ReturnType<typeof zonedParts>;
} {
  const now = nowIso ?? new Date().toISOString();
  const nowParts = zonedParts(now, timeZone);
  const start = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const daysUntilSunday = nowParts.weekday === 7 ? 0 : 7 - nowParts.weekday;
  const end = addDays(start, daysUntilSunday);
  return { start, end, nowParts };
}

/**
 * Resolve the CANONICAL (Monday -> Sunday) week boundary containing "now",
 * in the tenant timezone. Distinct from resolveThisWeekRange (whose start
 * is always today, changing every day) -- this is a stable weekly-cycle
 * identity: every day within the same real calendar week resolves to the
 * SAME monday, which is exactly the property a weekly campaign checkpoint
 * needs for idempotency (STRATXCEL weekly-engine brief Section 19: "one
 * Monday should not create duplicate campaigns" -- more precisely, no day
 * within a week should ever resolve to a different week-identity than any
 * other day in that same week).
 */
export function resolveCanonicalWeekBounds(timeZone: string, nowIso?: string): {
  mondayLocalDate: { year: number; month: number; day: number };
  sundayLocalDate: { year: number; month: number; day: number };
  /** YYYY-MM-DD of mondayLocalDate -- the real, stable weekly-campaign key. */
  weekKey: string;
  nowParts: ReturnType<typeof zonedParts>;
} {
  const now = nowIso ?? new Date().toISOString();
  const nowParts = zonedParts(now, timeZone);
  const today = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const daysSinceMonday = nowParts.weekday - 1; // weekday: Mon=1 ... Sun=7
  const mondayLocalDate = addDays(today, -daysSinceMonday);
  const sundayLocalDate = addDays(mondayLocalDate, 6);
  const weekKey = `${mondayLocalDate.year}-${String(mondayLocalDate.month).padStart(2, "0")}-${String(mondayLocalDate.day).padStart(2, "0")}`;
  return { mondayLocalDate, sundayLocalDate, weekKey, nowParts };
}

function candidateHours(preferred?: readonly number[]): number[] {
  if (preferred && preferred.length > 0) return [...preferred];
  return [...DEFAULT_WEEKLY_SLOT_POLICY.weekdayHours];
}

/**
 * Build concrete future scheduledAt values for a week-planning request.
 * Never schedules in the past. Never returns null scheduledAt.
 */
export function planWeekSlots(input: WeekPlanInput): PlannedWeekSlot[] {
  const timeZone = input.timeZone?.trim();
  if (!timeZone) throw new WeekPlanError("timezone_required");
  if (!Number.isInteger(input.itemCount) || input.itemCount < 1) {
    throw new WeekPlanError("item_count_required");
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) throw new WeekPlanError("invalid_now");

  const week = resolveThisWeekRange(timeZone, nowIso);
  const start = input.rangeStartLocalDate ?? week.start;
  const end = input.rangeEndLocalDate ?? week.end;
  if (compareDay(end, start) < 0) throw new WeekPlanError("invalid_range");

  const hours = candidateHours(input.preferredHours);
  const minute = DEFAULT_WEEKLY_SLOT_POLICY.minute;
  const hasPreferredHours = Boolean(input.preferredHours?.length);
  const source = input.scheduleSource ?? (hasPreferredHours ? "TENANT_PREFERENCE" : "SYSTEM_DEFAULT");

  const slots: PlannedWeekSlot[] = [];
  let cursor = { ...start };

  while (compareDay(cursor, end) <= 0 && slots.length < input.itemCount) {
    const weekday = isoWeekday(cursor, timeZone);
    const isWeekend = weekday >= 6;
    // Default policy prefers weekdays; on weekends use weekendHours only when
    // no explicit preferredHours were supplied.
    const dayHours =
      isWeekend && DEFAULT_WEEKLY_SLOT_POLICY.preferWeekdays && !hasPreferredHours
        ? [...DEFAULT_WEEKLY_SLOT_POLICY.weekendHours]
        : hours;

    for (const hour of dayHours) {
      if (slots.length >= input.itemCount) break;
      const scheduledAtIso = zonedWallTimeToUtcIso(cursor.year, cursor.month, cursor.day, hour, minute, timeZone);
      const scheduledMs = Date.parse(scheduledAtIso);
      if (Number.isNaN(scheduledMs) || scheduledMs <= nowMs) continue;

      const scheduleIntent = buildScheduleIntent({
        kind: "AT",
        timeZone,
        scheduledAtIso,
      });
      slots.push({
        scheduledAtIso,
        timeZone,
        wallClockLabel: utcIsoToDatetimeLocalValue(scheduledAtIso, timeZone),
        scheduleSource: source,
        scheduleIntent,
        localYear: cursor.year,
        localMonth: cursor.month,
        localDay: cursor.day,
        localHour: hour,
        localMinute: minute,
      });
    }
    cursor = addDays(cursor, 1);
  }

  // If weekday-first policy exhausted slots before itemCount, expand into remaining days
  // with denser hours rather than collapsing to NOW.
  if (slots.length < input.itemCount) {
    cursor = { ...start };
    const denser = [9, 11, 14, 16, 18, 20];
    while (compareDay(cursor, end) <= 0 && slots.length < input.itemCount) {
      for (const hour of denser) {
        if (slots.length >= input.itemCount) break;
        const scheduledAtIso = zonedWallTimeToUtcIso(cursor.year, cursor.month, cursor.day, hour, minute, timeZone);
        const scheduledMs = Date.parse(scheduledAtIso);
        if (Number.isNaN(scheduledMs) || scheduledMs <= nowMs) continue;
        if (slots.some((s) => s.scheduledAtIso === scheduledAtIso)) continue;
        const scheduleIntent = buildScheduleIntent({ kind: "AT", timeZone, scheduledAtIso });
        slots.push({
          scheduledAtIso,
          timeZone,
          wallClockLabel: utcIsoToDatetimeLocalValue(scheduledAtIso, timeZone),
          scheduleSource: source,
          scheduleIntent,
          localYear: cursor.year,
          localMonth: cursor.month,
          localDay: cursor.day,
          localHour: hour,
          localMinute: minute,
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  if (slots.length < input.itemCount) {
    throw new WeekPlanError(
      `plan_constraint: only ${slots.length} future slot(s) remain in the requested week for ${input.itemCount} item(s)`,
    );
  }

  // Stable chronological order
  slots.sort((a, b) => a.scheduledAtIso.localeCompare(b.scheduledAtIso));
  return slots.slice(0, input.itemCount);
}

/** Reject a weekly-plan schedule_post that lacks a concrete future datetime. */
export function assertWeekPlanScheduleValid(input: {
  scheduledAt?: string | null;
  timeZone?: string | null;
  rangeStartIso: string;
  rangeEndIso: string;
  nowIso?: string;
}): ScheduleIntent {
  if (!input.timeZone?.trim()) throw new SocialScheduleError("timezone_required");
  if (!input.scheduledAt) throw new SocialScheduleError("scheduled_at_required");
  const intent = buildScheduleIntent({
    kind: "AT",
    timeZone: input.timeZone,
    scheduledAtIso: input.scheduledAt,
  });
  const at = Date.parse(intent.scheduledAtIso!);
  const now = Date.parse(input.nowIso ?? new Date().toISOString());
  const start = Date.parse(input.rangeStartIso);
  const end = Date.parse(input.rangeEndIso);
  if (Number.isNaN(at) || Number.isNaN(now) || Number.isNaN(start) || Number.isNaN(end)) {
    throw new SocialScheduleError("invalid_scheduled_at");
  }
  if (at <= now) throw new SocialScheduleError("scheduled_at_in_past");
  if (at < start || at > end) throw new SocialScheduleError("scheduled_at_outside_plan_range");
  return intent;
}
