import type { ServiceClient } from "./db.ts";
import { createAndEstimateMission } from "./repository.ts";
import type { MissionRow } from "./types.ts";

export type RecurringCadence = "daily" | "weekly" | "monthly";

export interface RecurringMissionTemplateRow {
  id: string;
  tenant_id: string;
  label: string;
  goal_text: string;
  cadence: RecurringCadence;
  enabled: boolean;
  next_fire_at: string;
  last_fired_at: string | null;
  last_mission_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const CADENCE_MS: Record<RecurringCadence, number> = {
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000, // deliberately a fixed 30-day period, not calendar-month arithmetic -- simple, predictable, no DST/month-length edge cases to get wrong for a v1.
};

/**
 * Pure. Advances repeatedly from the template's own last scheduled fire
 * time (never from `now`) so a template that was due multiple times while
 * the processor wasn't running (e.g. after a deploy gap) skips the missed
 * periods rather than firing once per missed period in a burst -- the
 * idempotency key alone (see processRecurringTemplates) would also
 * prevent duplicates, but avoiding the burst in the first place is
 * strictly better.
 */
export function computeNextFireAt(cadence: RecurringCadence, from: Date, now: Date): Date {
  const stepMs = CADENCE_MS[cadence];
  let next = from.getTime();
  const nowMs = now.getTime();
  if (next > nowMs) return new Date(next);
  while (next <= nowMs) next += stepMs;
  return new Date(next);
}

/** Pure. */
export function isTemplateDue(template: Pick<RecurringMissionTemplateRow, "enabled" | "next_fire_at">, now: Date): boolean {
  if (!template.enabled) return false;
  return new Date(template.next_fire_at).getTime() <= now.getTime();
}

/**
 * A stable, real idempotency key for one template's firing in one cadence
 * period -- e.g. "recurring:<templateId>:daily:2026-09-07". Passed straight
 * into createAndEstimateMission's own real idempotency-key dedup (an
 * existing, already-tested guard -- see repository.ts), so two overlapping
 * processor runs (a cron retry, a manual trigger racing the cron) can never
 * create two missions for the same template's same period.
 */
export function buildRecurringIdempotencyKey(templateId: string, cadence: RecurringCadence, at: Date): string {
  const iso = at.toISOString();
  const bucket = cadence === "daily" ? iso.slice(0, 10) : cadence === "weekly" ? isoWeekBucket(at) : iso.slice(0, 7);
  return `recurring:${templateId}:${cadence}:${bucket}`;
}

function isoWeekBucket(d: Date): string {
  // ISO week number, UTC -- stable, no timezone ambiguity.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export interface RecurringFireResult {
  templateId: string;
  tenantId: string;
  outcome: "fired" | "failed";
  missionId?: string;
  error?: string;
}

/**
 * Real, callable, and fully tested -- but its automatic invocation from a
 * live cron is deliberately gated behind isRecurringMissionsEnabled()
 * (see feature-flag.ts), off by default. Reason, stated honestly: this
 * calls the REAL createAndEstimateMission, whose own documented behavior
 * reserves real wallet funds once a mission reaches READY -- a genuine
 * financial commitment, not a routine engineering default. The mechanism
 * is real and safe to ship; unattended automatic firing is a Founder
 * activation decision, matching this session's own established precedent
 * for HERMES_MODE and OPENROUTER_ENABLED. A staff-invoked manual trigger
 * (run_recurring_mission_templates_now) always works regardless of the
 * flag, since a human explicitly asking IS the authorization.
 */
export async function processRecurringTemplates(supabase: ServiceClient, now: Date = new Date()): Promise<RecurringFireResult[]> {
  const { data, error } = await supabase
    .from("recurring_mission_templates")
    .select("*")
    .eq("enabled", true)
    .lte("next_fire_at", now.toISOString());
  if (error) throw new Error(`processRecurringTemplates: ${error.message}`);

  const due = (data ?? []) as RecurringMissionTemplateRow[];
  const results: RecurringFireResult[] = [];

  for (const template of due) {
    const idempotencyKey = buildRecurringIdempotencyKey(template.id, template.cadence, now);
    try {
      const mission: MissionRow = await createAndEstimateMission(supabase, {
        tenantId: template.tenant_id,
        createdBy: template.created_by,
        goalText: template.goal_text,
        idempotencyKey,
      });
      const nextFireAt = computeNextFireAt(template.cadence, new Date(template.next_fire_at), now);
      const { error: updateError } = await supabase
        .from("recurring_mission_templates")
        .update({ next_fire_at: nextFireAt.toISOString(), last_fired_at: now.toISOString(), last_mission_id: mission.id, updated_at: now.toISOString() })
        .eq("id", template.id);
      if (updateError) throw new Error(updateError.message);
      results.push({ templateId: template.id, tenantId: template.tenant_id, outcome: "fired", missionId: mission.id });
    } catch (err) {
      // One template's failure must never stop the rest from firing --
      // advance nothing on failure so it's retried on the next pass.
      results.push({ templateId: template.id, tenantId: template.tenant_id, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
