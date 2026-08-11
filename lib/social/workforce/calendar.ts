import { assertConcreteCalendarItem, buildScheduleIntent } from "./schedule.ts";
import type { ScheduleIntent } from "./types.ts";
import type { GrowthSocialSubPlanLike } from "./package-plan.ts";

export interface SocialCalendarItem {
  id: string;
  title: string;
  platform: string | null;
  scheduledAtIso: string;
  timeZone: string;
  wallClockLabel: string | null;
  sourcePlannedUnitId: string;
}

/**
 * Calendar derives from Business Growth Plan / social subplan with real timestamps.
 * Rejects "this week" style items without dates.
 */
export function buildSocialCalendarFromSubPlan(
  subplan: GrowthSocialSubPlanLike,
  timeZone: string,
  slotTimestamps: ReadonlyArray<{ plannedUnitId: string; scheduledAtIso: string }>,
): SocialCalendarItem[] {
  const byId = new Map(slotTimestamps.map((s) => [s.plannedUnitId, s.scheduledAtIso]));
  const items: SocialCalendarItem[] = [];

  for (const unit of subplan.plannedUnits) {
    const scheduledAtIso = unit.scheduledAtIso ?? byId.get(unit.id) ?? null;
    assertConcreteCalendarItem({
      label: unit.objective,
      scheduledAtIso,
    });
    const intent: ScheduleIntent = buildScheduleIntent({
      kind: "PACKAGE_SLOT",
      timeZone,
      scheduledAtIso,
    });
    items.push({
      id: `cal:${unit.id}`,
      title: unit.objective,
      platform: unit.details?.platform ?? subplan.connectedChannels[0]?.toLowerCase() ?? null,
      scheduledAtIso: intent.scheduledAtIso as string,
      timeZone,
      wallClockLabel: intent.wallClockLabel ?? null,
      sourcePlannedUnitId: unit.id,
    });
  }

  return items;
}
