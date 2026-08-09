import { updateHermesSuggestion } from "../repositories/reviews-plans";
import { getHermesSuggestion, type HermesSuggestion } from "./morning-plan-hermes";

const TERMINAL_STATES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED", "BLOCKED"]);

/**
 * Called on page render for the "Today" card. If the plan has a Hermes
 * mission attached and we haven't already cached a terminal result for
 * it, re-reads the mission's live state (never throws — a Hermes-read
 * failure just means the UI shows nothing extra, the deterministic plan
 * is unaffected) and caches it so repeat page loads don't re-query
 * mission_events once the mission is done.
 */
export async function getFreshHermesSuggestion(
  ownerId: string,
  planDate: string,
  plan: { hermes_mission_id?: string | null; hermes_suggestion?: unknown } | null
): Promise<HermesSuggestion | null> {
  if (!plan?.hermes_mission_id) return null;

  const cached = plan.hermes_suggestion as HermesSuggestion | null | undefined;
  if (cached?.state && TERMINAL_STATES.has(cached.state)) return cached;

  try {
    const fresh = await getHermesSuggestion(plan.hermes_mission_id);
    await updateHermesSuggestion(ownerId, planDate, fresh as unknown as Record<string, unknown>);
    return fresh;
  } catch {
    return cached ?? null;
  }
}
