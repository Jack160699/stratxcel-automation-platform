import {
  datetimeLocalValueToUtcIso,
  utcIsoToDatetimeLocalValue,
  zonedWallTimeToUtcIso,
} from "../package-distribution.ts";
import type { ScheduleIntent, ScheduleIntentKind } from "./types.ts";

export class SocialScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialScheduleError";
  }
}

export interface BuildScheduleIntentInput {
  kind: ScheduleIntentKind;
  timeZone: string;
  scheduledAtIso?: string | null;
  wallDateTimeLocal?: string | null;
  nowIso?: string;
}

/**
 * Planned social items must have real date/time semantics.
 * PROPOSED schedule with a required date but no scheduledAt is rejected.
 */
export function buildScheduleIntent(input: BuildScheduleIntentInput): ScheduleIntent {
  const timeZone = input.timeZone?.trim();
  if (!timeZone) throw new SocialScheduleError("timezone_required");

  if (input.kind === "NOW") {
    const scheduledAtIso = input.nowIso ?? new Date().toISOString();
    return {
      kind: "NOW",
      scheduledAtIso,
      timeZone,
      wallClockLabel: utcIsoToDatetimeLocalValue(scheduledAtIso, timeZone),
    };
  }

  let scheduledAtIso = input.scheduledAtIso ?? null;
  if (!scheduledAtIso && input.wallDateTimeLocal) {
    scheduledAtIso = datetimeLocalValueToUtcIso(input.wallDateTimeLocal, timeZone);
  }

  if (!scheduledAtIso) {
    throw new SocialScheduleError("scheduled_at_required");
  }

  if (Number.isNaN(Date.parse(scheduledAtIso))) {
    throw new SocialScheduleError("invalid_scheduled_at");
  }

  return {
    kind: input.kind,
    scheduledAtIso,
    timeZone,
    wallClockLabel: utcIsoToDatetimeLocalValue(scheduledAtIso, timeZone),
  };
}

/** Reject vague "this week" calendar items without concrete dates. */
export function assertConcreteCalendarItem(item: {
  label?: string | null;
  scheduledAtIso?: string | null;
}): void {
  const label = (item.label ?? "").toLowerCase();
  const vague = /\bthis week\b|\bnext week\b|\bsoon\b|\btbd\b/.test(label);
  if (vague && !item.scheduledAtIso) {
    throw new SocialScheduleError("vague_schedule_without_datetime");
  }
  if (!item.scheduledAtIso) {
    throw new SocialScheduleError("calendar_item_requires_scheduled_at");
  }
}

export function wallPartsToScheduleIntent(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  kind: ScheduleIntentKind = "AT",
): ScheduleIntent {
  const scheduledAtIso = zonedWallTimeToUtcIso(year, month, day, hour, minute, timeZone);
  return buildScheduleIntent({ kind, timeZone, scheduledAtIso });
}

/** Validate a proposed schedule_post action payload before it becomes PROPOSED. */
export function validateProposedScheduleAction(input: {
  requiresFutureDate: boolean;
  scheduledAt?: string | null;
  timeZone: string;
}): ScheduleIntent {
  if (input.requiresFutureDate) {
    return buildScheduleIntent({
      kind: "AT",
      timeZone: input.timeZone,
      scheduledAtIso: input.scheduledAt,
    });
  }
  return buildScheduleIntent({
    kind: "NOW",
    timeZone: input.timeZone,
    scheduledAtIso: input.scheduledAt || undefined,
  });
}
