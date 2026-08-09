import { createServiceClient, createAndEstimateMission, getMission, listMissionEvents, type MissionState } from "@stratxcel/missions";
import { buildBoundedOwnerContext } from "./owner-memory-context";

export interface HermesAssistResult {
  used: boolean;
  reason?: string;
  missionId?: string;
}

export interface HermesSuggestion {
  state: MissionState;
  summary?: string;
}

/**
 * Deliberately unique — the service catalogue entry
 * "owner_operating_brain_context" (packages/missions/src/service-catalogue/
 * catalogue.ts) matches on exactly this keyword, so goal text built here
 * always compiles to that zero-cost, stratxcel-admin-growth-profile entry
 * rather than falling through to generic custom_mission matching or,
 * worse, accidentally matching a billed catalogue keyword.
 */
const GOAL_KEYWORD = "owner-operating-brain-context-review";
const MAX_GOAL_TEXT_CHARS = 6000;

/**
 * Real Hermes integration, through the REAL, UNMODIFIED mission pipeline
 * (createAndEstimateMission -> queueMissionForExecution -> the shared
 * Postgres queue -> mission-worker's existing claim/compile/execute/
 * transition loop -> apps/hermes-gateway). Nothing here bypasses signed
 * mission tokens, tenant scoping, or the tool allowlist — this function
 * only ever supplies a tenantId and a goal string; every authorization
 * decision downstream is the exact same code path every other mission
 * (client or internal) goes through.
 *
 * tenantId is the real "stratxcel" tenant (id resolved once via a live
 * read against the production tenants/tenant_members tables — not
 * invented), whose sole member is the owner with role 'owner'. Set via
 * OWNER_BRAIN_HERMES_TENANT_ID rather than hardcoded so this stays
 * environment-portable (a fresh Supabase project/staging environment
 * would have a different tenant id).
 *
 * Fire-and-forget by design ("long missions must be asynchronous; return
 * IDs immediately" — master brief): this function returns as soon as the
 * mission is queued, well within a Vercel Cron route's timeout. The
 * deterministic rules-based plan (planner/morning-plan.ts) is always
 * generated and saved first and is never overwritten by this — Hermes's
 * result, whenever it completes, is surfaced as a separate suggestion
 * (see getHermesSuggestion), which IS the "safe fallback": the active
 * plan is always the deterministic one; Hermes is advisory on top.
 */
export async function attemptHermesAssistedPlan(ownerId: string, planDate: string): Promise<HermesAssistResult> {
  const tenantId = process.env.OWNER_BRAIN_HERMES_TENANT_ID;
  if (!tenantId) {
    return { used: false, reason: "OWNER_BRAIN_HERMES_TENANT_ID not configured — see MANUAL ACTIONS in the build report" };
  }

  let context;
  try {
    context = await buildBoundedOwnerContext(ownerId);
  } catch (err) {
    return { used: false, reason: `context build failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const goalText = buildGoalText(planDate, context);

  try {
    const supabase = createServiceClient();
    const mission = await createAndEstimateMission(supabase, {
      tenantId,
      createdBy: ownerId,
      goalText,
      // One mission per owner per day — a retried cron invocation (or a
      // manual re-trigger the same day) reuses the same in-flight mission
      // instead of queuing a duplicate.
      idempotencyKey: `owner-brain-plan:${ownerId}:${planDate}`,
    });
    return { used: true, missionId: mission.id };
  } catch (err) {
    // Never throws out of this function — a Hermes/mission-pipeline
    // failure must never take down the (already-saved) deterministic plan.
    return { used: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function buildGoalText(planDate: string, context: unknown): string {
  const contextJson = JSON.stringify(context);
  const instruction =
    `${GOAL_KEYWORD}\n\n` +
    `Date: ${planDate}\n` +
    "Review this bounded, pre-approved slice of the owner's own operating-brain context " +
    "(already filtered: no unconfirmed inferences, no raw event data, no secrets) and suggest " +
    "today's Top 3 priorities, one deep-work focus, and one thing to avoid. " +
    "Respond in under 150 words, plain text, no markdown.\n\nContext JSON:\n";
  const budget = MAX_GOAL_TEXT_CHARS - instruction.length;
  return instruction + (contextJson.length > budget ? contextJson.slice(0, budget) : contextJson);
}

/**
 * Read-back for the UI. Returns the mission's current state always; only
 * includes a summary once the mission actually reached a state where
 * mission-worker recorded one (see apps/mission-worker's
 * `transitionMission(..., { payload: { summary: result.summary } })`).
 * A still-RUNNING/QUEUED mission is a legitimate, honestly-reported
 * "still working" state, not an error.
 */
export async function getHermesSuggestion(missionId: string): Promise<HermesSuggestion> {
  const supabase = createServiceClient();
  const mission = await getMission(supabase, missionId);

  const events = await listMissionEvents(supabase, missionId);
  const finalEvent = [...events]
    .reverse()
    .find((e) => e.event_type === "state_changed" && typeof (e.payload as { summary?: unknown })?.summary === "string");

  return {
    state: mission.state,
    summary: finalEvent ? ((finalEvent.payload as { summary: string }).summary) : undefined,
  };
}
