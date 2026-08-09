import { getServiceContext, type OwnerContext } from "../db-context";

export interface DailyReviewInput {
  reviewDate: string;
  done?: string;
  problems?: string;
  decisions?: string;
  communication?: string;
  moodEnergy?: Record<string, unknown>;
  health?: string;
  socialFamily?: string;
  learned?: string;
  openLoops?: unknown[];
  tomorrowTop3?: string[];
  source?: "manual" | "auto_prompted";
}

export async function upsertDailyReview(ctx: OwnerContext, input: DailyReviewInput): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("owner_daily_reviews")
    .upsert(
      {
        owner_id: ctx.ownerId,
        review_date: input.reviewDate,
        done: input.done ?? null,
        problems: input.problems ?? null,
        decisions: input.decisions ?? null,
        communication: input.communication ?? null,
        mood_energy: input.moodEnergy ?? {},
        health: input.health ?? null,
        social_family: input.socialFamily ?? null,
        learned: input.learned ?? null,
        open_loops: input.openLoops ?? [],
        tomorrow_top3: input.tomorrowTop3 ?? [],
        source: input.source ?? "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,review_date" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertDailyReview failed: ${error.message}`);
  return data.id as string;
}

export async function getDailyReview(ctx: OwnerContext, reviewDate: string) {
  return getDailyReviewForOwner(ctx.supabase, ctx.ownerId, reviewDate);
}

/** Service-role variant for background jobs (night-review auto-draft) that have an ownerId but no browser session. */
export async function getDailyReviewForOwner(supabase: ReturnType<typeof getServiceContext>["supabase"], ownerId: string, reviewDate: string) {
  const { data, error } = await supabase.from("owner_daily_reviews").select("*").eq("owner_id", ownerId).eq("review_date", reviewDate).maybeSingle();
  if (error) throw new Error(`getDailyReview failed: ${error.message}`);
  return data;
}

/** Service-role write path for the night-review auto-draft job — same upsert semantics as upsertDailyReview but takes an ownerId directly instead of an OwnerContext. */
export async function upsertDailyReviewForOwner(ownerId: string, input: DailyReviewInput): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_daily_reviews")
    .upsert(
      {
        owner_id: ownerId,
        review_date: input.reviewDate,
        done: input.done ?? null,
        problems: input.problems ?? null,
        decisions: input.decisions ?? null,
        communication: input.communication ?? null,
        mood_energy: input.moodEnergy ?? {},
        health: input.health ?? null,
        social_family: input.socialFamily ?? null,
        learned: input.learned ?? null,
        open_loops: input.openLoops ?? [],
        tomorrow_top3: input.tomorrowTop3 ?? [],
        source: input.source ?? "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,review_date" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertDailyReviewForOwner failed: ${error.message}`);
  return data.id as string;
}

export async function listDailyReviews(ctx: OwnerContext, limit = 14) {
  const { data, error } = await ctx.supabase
    .from("owner_daily_reviews")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .order("review_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listDailyReviews failed: ${error.message}`);
  return data ?? [];
}

/** Service-role read used by the morning-planner job (no owner session available in a cron). */
export async function getLatestReviewForOwner(ownerId: string) {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_daily_reviews")
    .select("*")
    .eq("owner_id", ownerId)
    .order("review_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestReviewForOwner failed: ${error.message}`);
  return data;
}

export interface DailyPlanInput {
  planDate: string;
  top3: string[];
  deepWork: unknown[];
  lightTasks: unknown[];
  communication: unknown[];
  health: Record<string, unknown>;
  socialFamily: Record<string, unknown>;
  whatToAvoid?: string;
  openLoops: unknown[];
  basedOnReviewId?: string | null;
  generatedBy: "manual" | "hermes" | "rules";
}

export async function upsertDailyPlan(ownerId: string, input: DailyPlanInput): Promise<string> {
  const service = getServiceContext().supabase;
  const { data, error } = await service
    .from("owner_daily_plans")
    .upsert(
      {
        owner_id: ownerId,
        plan_date: input.planDate,
        top3: input.top3,
        deep_work: input.deepWork,
        light_tasks: input.lightTasks,
        communication: input.communication,
        health: input.health,
        social_family: input.socialFamily,
        what_to_avoid: input.whatToAvoid ?? null,
        open_loops: input.openLoops,
        based_on_review_id: input.basedOnReviewId ?? null,
        generated_by: input.generatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,plan_date" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsertDailyPlan failed: ${error.message}`);
  return data.id as string;
}

export async function getDailyPlan(ctx: OwnerContext, planDate: string) {
  const { data, error } = await ctx.supabase
    .from("owner_daily_plans")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (error) throw new Error(`getDailyPlan failed: ${error.message}`);
  return data;
}
