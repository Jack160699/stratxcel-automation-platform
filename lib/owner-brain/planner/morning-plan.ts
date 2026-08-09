import { getServiceContext } from "../db-context";
import { getLatestReviewForOwner, upsertDailyPlan, attachHermesMissionToPlan } from "../repositories/reviews-plans";
import { listOpenLoopsForOwner } from "../repositories/open-loops";
import { listMemoriesForOwner } from "../repositories/memories";
import { derivePlanShape } from "./rules";
import { attemptHermesAssistedPlan } from "../hermes/morning-plan-hermes";

export interface GeneratedPlan {
  top3: string[];
  deepWork: Array<{ label: string; reason: string }>;
  lightTasks: string[];
  communication: string[];
  health: Record<string, unknown>;
  socialFamily: Record<string, unknown>;
  whatToAvoid?: string;
  openLoops: Array<{ item: string; dueDate: string | null }>;
}

/**
 * Rules-based morning plan — deterministic, no external model call, safe
 * default. lib/owner-brain/hermes/morning-plan-hermes.ts can layer a
 * Hermes-assisted rewrite of the SAME bounded inputs on top of this; this
 * function is what actually runs when Hermes isn't configured or the
 * mission fails, so the planner never goes silent.
 *
 * "If the previous plan was overloaded: SIMPLIFY" — implemented literally:
 * if yesterday's plan had more than 3 top3 items or the night review's
 * mood/energy self-report reads low, this plan caps itself to fewer
 * deep-work blocks rather than filling every hour.
 */
export async function generateRulesBasedPlan(ownerId: string, planDate: string): Promise<GeneratedPlan> {
  const service = getServiceContext().supabase;

  const [latestReview, openLoops, memories] = await Promise.all([
    getLatestReviewForOwner(ownerId),
    listOpenLoopsForOwner(service, ownerId, "OPEN"),
    listMemoriesForOwner(service, ownerId, { memoryType: "EXPLICIT_PREFERENCE", limit: 20 }),
  ]);

  const dayStart = `${planDate}T00:00:00.000Z`;
  const dayEnd = `${planDate}T23:59:59.999Z`;
  const { data: todaysEvents } = await service
    .from("owner_events")
    .select("event_type, payload, occurred_at")
    .eq("owner_id", ownerId)
    .eq("event_type", "calendar_event")
    .gte("occurred_at", dayStart)
    .lte("occurred_at", dayEnd)
    .order("occurred_at", { ascending: true });

  const meetingCount = todaysEvents?.length ?? 0;
  const moodEnergy = (latestReview?.mood_energy ?? {}) as { energy?: string; mood?: string };
  const isLowEnergy = moodEnergy.energy === "low";

  const overdueLoops = openLoops.filter((l) => l.due_date && l.due_date < planDate);
  const dueSoonLoops = openLoops.filter((l) => !l.due_date || l.due_date >= planDate);

  const top3Source = latestReview?.tomorrow_top3 as string[] | undefined;
  const top3Candidates = top3Source?.length ? top3Source : overdueLoops.map((l) => l.item);

  const shape = derivePlanShape({
    isLowEnergy,
    meetingCount,
    top3Candidates,
    dueSoonItems: dueSoonLoops.map((l) => l.item),
  });

  return {
    top3: shape.top3,
    deepWork: shape.deepWork,
    lightTasks: shape.lightTasks,
    communication: [],
    health: shape.healthNote ? { note: shape.healthNote } : {},
    socialFamily: {},
    whatToAvoid: shape.whatToAvoid,
    openLoops: openLoops.slice(0, 8).map((l) => ({ item: l.item, dueDate: l.due_date })),
  };
}

/**
 * Always generates and saves the deterministic rules-based plan first —
 * that write is unconditional and is what "today's plan" means in the UI
 * the instant this function returns. Hermes assistance is layered on top,
 * best-effort, after that save: attemptHermesAssistedPlan queues a real
 * (audited, tenant-scoped, tool-restricted) mission and can never fail
 * this function or overwrite the saved plan — see
 * hermes/morning-plan-hermes.ts for the full rationale. `generatedBy`
 * stays "rules" regardless of whether Hermes was attempted; the plan's
 * `hermes_mission_id`/`hermes_suggestion` fields are what the UI uses to
 * show Hermes's advisory suggestion alongside it once available.
 */
export async function generateAndSaveMorningPlan(ownerId: string, planDate: string, generatedBy: "rules" | "hermes" = "rules"): Promise<string> {
  const plan = await generateRulesBasedPlan(ownerId, planDate);
  const latestReview = await getLatestReviewForOwner(ownerId);
  const planId = await upsertDailyPlan(ownerId, {
    planDate,
    top3: plan.top3,
    deepWork: plan.deepWork,
    lightTasks: plan.lightTasks,
    communication: plan.communication,
    health: plan.health,
    socialFamily: plan.socialFamily,
    whatToAvoid: plan.whatToAvoid,
    openLoops: plan.openLoops,
    basedOnReviewId: (latestReview?.id as string | undefined) ?? null,
    generatedBy,
  });

  const hermesResult = await attemptHermesAssistedPlan(ownerId, planDate).catch((err) => ({
    used: false as const,
    reason: err instanceof Error ? err.message : String(err),
  }));
  if (hermesResult.used && hermesResult.missionId) {
    await attachHermesMissionToPlan(ownerId, planDate, hermesResult.missionId).catch(() => {});
  }

  return planId;
}
