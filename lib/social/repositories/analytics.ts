import { createSupabaseServiceClient } from "../../supabase/service.ts";
import type { OwnerContext } from "../db-context.ts";
import { type AgentReadContext } from "../agent-tenant-types.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface MetricsRow {
  id: string;
  variant_id: string;
  provider_post_id: string | null;
  measured_at: string;
  /** STRATXCEL two-gap closure brief (Gap 1): real per-day observation key
   * (see 20260831010000_social_metrics_observation_date.sql) -- lets
   * recordMetrics upsert idempotently instead of accumulating an unbounded
   * duplicate row every time the same post is measured the same day. */
  observation_date: string;
  reach: number;
  impressions: number;
  views: number;
  watch_time_seconds: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  followers_gained: number;
  leads: number;
  conversions: number;
  raw: Record<string, unknown>;
}

export async function listRecentMetrics(ctx: AgentReadContext, limit = 50): Promise<MetricsRow[]> {
  const { data } = await ctx.supabase
    .from("social_metrics")
    .select("*, content_variants(platform, caption, master_id)")
    .order("measured_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as MetricsRow[];
}

/**
 * Real per-day upsert (STRATXCEL two-gap closure brief, Gap 1/5.7
 * idempotency): the same (variant_id, observation_date) key always
 * overwrites the prior real row for that day rather than accumulating a
 * duplicate, so calling this twice for the same post the same day --
 * worker.ts's own post-publish anchor call followed by a same-day real
 * ingestion pass, a retried request, two concurrent workers -- is a real,
 * atomic Postgres ON CONFLICT DO UPDATE, never a duplicate observation.
 * observation_date defaults to today (UTC) at the database level when the
 * caller doesn't pass one, so every pre-existing call site (worker.ts)
 * keeps working unmodified.
 */
export async function recordMetrics(
  service: ServiceClient,
  variantId: string,
  providerPostId: string | null,
  metrics: Partial<Omit<MetricsRow, "id" | "variant_id" | "measured_at" | "observation_date">>,
  observationDate?: string
) {
  await service
    .from("social_metrics")
    .upsert(
      { variant_id: variantId, provider_post_id: providerPostId, ...(observationDate ? { observation_date: observationDate } : {}), ...metrics },
      { onConflict: "variant_id,observation_date" }
    );
}

export async function listCostEvents(ctx: OwnerContext, limit = 100) {
  const { data } = await ctx.supabase.from("social_cost_events").select("*").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function recordCostEvent(
  ctx: OwnerContext,
  input: { masterId?: string | null; category: string; provider: string; model?: string; amountCents: number; metadata?: Record<string, unknown> }
) {
  await ctx.supabase.from("social_cost_events").insert({
    owner_id: ctx.ownerId,
    master_id: input.masterId ?? null,
    category: input.category,
    provider: input.provider,
    model: input.model ?? null,
    amount_cents: input.amountCents,
    metadata: input.metadata ?? {},
  });
}

export async function listExperiments(ctx: OwnerContext) {
  const { data } = await ctx.supabase.from("social_experiments").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function createExperiment(ctx: OwnerContext, input: { name: string; hypothesis: string; variable: string }) {
  const { error } = await ctx.supabase.from("social_experiments").insert({
    owner_id: ctx.ownerId,
    name: input.name,
    hypothesis: input.hypothesis,
    variable: input.variable,
    status: "PLANNED",
  });
  if (error) throw new Error(error.message);
}

export async function listResearchItems(ctx: OwnerContext) {
  const { data } = await ctx.supabase.from("social_research_items").select("*").order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function createResearchItem(ctx: OwnerContext, input: { kind: string; title: string; summary?: string; sourceUrl?: string }) {
  const { error } = await ctx.supabase.from("social_research_items").insert({
    owner_id: ctx.ownerId,
    kind: input.kind,
    title: input.title,
    summary: input.summary ?? null,
    source_url: input.sourceUrl ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listWeeklyReports(ctx: OwnerContext) {
  const { data } = await ctx.supabase.from("social_weekly_reports").select("*").order("week_start", { ascending: false }).limit(12);
  return data ?? [];
}
