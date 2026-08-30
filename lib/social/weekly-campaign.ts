import { createSupabaseServiceClient } from "../supabase/service.ts";
import { resolveCanonicalWeekBounds } from "./workforce/week-planner.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL weekly-engine brief (Sections 17-22, 56, 61): a real,
 * persisted, idempotent per-tenant weekly-campaign checkpoint additive to
 * the existing, proven, revenue-critical period model
 * (social_autopilot_authorizations.period_number/period_target_units --
 * unchanged, unreplaced). This module answers exactly one question with a
 * real database row: "which real calendar week (Monday-Sunday, tenant
 * timezone) is this authorization's autopilot in right now, and has a
 * checkpoint for it already been created" -- so a Monday trigger firing
 * more than once (retries, overlapping cron ticks, a manual re-run) can
 * never create a duplicate weekly campaign for the same week.
 *
 * Deliberately NOT a full weekly re-strategizing engine. What this module
 * does NOT do, honestly: it does not itself refresh competitor
 * intelligence, refresh social-trend intelligence, or re-run strategy --
 * those remain real, identified, NOT-YET-BUILT capabilities (no live
 * competitor/trend research pipeline exists in this codebase today; see
 * docs/architecture/PACKAGE_AUTOPILOT_AND_HERMES.md's "What this is NOT"
 * section). Building that safely on a live revenue system is a separate,
 * substantial piece of work, not something to bolt on unverified in the
 * same pass as this checkpoint. This module gives that future work a real
 * place to persist its output (the `strategy` / `performance_snapshot`
 * columns) and a real, tested, idempotent trigger point to run from --
 * the correct, honest scope for this pass (STRATXCEL brief: "build the
 * correct framework now... clearly identify the missing signal... do not
 * fabricate performance data").
 */
export interface WeeklyCampaignRow {
  id: string;
  tenant_id: string;
  authorization_id: string;
  week_key: string;
  week_start: string;
  week_end: string;
  status: "ACTIVE" | "COMPLETED";
  strategy: Record<string, unknown>;
  performance_snapshot: Record<string, unknown> | null;
  performance_signal_status: "NO_ANALYTICS_AVAILABLE" | "SNAPSHOT_RECORDED";
  created_at: string;
  updated_at: string;
}

/**
 * Idempotently returns this tenant's real weekly-campaign checkpoint for
 * "now" (tenant timezone), creating one if this is the first time this
 * real calendar week has been seen for this authorization. Never creates
 * a second row for the same (tenant_id, week_key) -- relies on the DB's
 * own unique constraint, not just an app-level check-then-insert race.
 *
 * Throws on a genuine database error (unlike recordCampaignTask/recordAudit)
 * -- callers that treat this as a load-bearing checkpoint should know when
 * it didn't happen; callers that only want best-effort observability should
 * wrap the call in their own try/catch, matching every other additive
 * instrumentation call site in this codebase.
 */
export async function ensureWeeklyCampaignForTenant(
  service: ServiceClient,
  input: { tenantId: string; authorizationId: string; timezone: string; nowIso?: string }
): Promise<WeeklyCampaignRow> {
  const bounds = resolveCanonicalWeekBounds(input.timezone, input.nowIso);
  const fmt = (d: { year: number; month: number; day: number }) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

  const { data: existing, error: readError } = await service
    .from("social_autopilot_weekly_campaigns")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("week_key", bounds.weekKey)
    .maybeSingle();
  if (readError) throw new Error(`ensureWeeklyCampaignForTenant: read failed: ${readError.message}`);
  if (existing) return existing as WeeklyCampaignRow;

  const { data: inserted, error: insertError } = await service
    .from("social_autopilot_weekly_campaigns")
    .upsert(
      {
        tenant_id: input.tenantId,
        authorization_id: input.authorizationId,
        week_key: bounds.weekKey,
        week_start: fmt(bounds.mondayLocalDate),
        week_end: fmt(bounds.sundayLocalDate),
      },
      { onConflict: "tenant_id,week_key", ignoreDuplicates: false }
    )
    .select("*")
    .single();
  if (insertError) throw new Error(`ensureWeeklyCampaignForTenant: insert failed: ${insertError.message}`);
  return inserted as WeeklyCampaignRow;
}

/**
 * Real Monday-trigger detection (STRATXCEL brief Section 61: "verify, do
 * not actually consume future production content unnecessarily"). Pure,
 * deterministic, no I/O -- returns whether "now" (tenant timezone) falls
 * on the real Monday of a real week, which is what a scheduled Monday
 * cron/trigger would check before running the weekly refresh described
 * above.
 */
export function isRealMondayNow(timezone: string, nowIso?: string): boolean {
  return resolveCanonicalWeekBounds(timezone, nowIso).nowParts.weekday === 1;
}
