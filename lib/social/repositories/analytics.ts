import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";
import { type AgentReadContext } from "../agent-tenant-types.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface MetricsRow {
  id: string;
  variant_id: string;
  provider_post_id: string | null;
  measured_at: string;
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

export async function recordMetrics(service: ServiceClient, variantId: string, providerPostId: string | null, metrics: Partial<Omit<MetricsRow, "id" | "variant_id" | "measured_at">>) {
  await service.from("social_metrics").insert({ variant_id: variantId, provider_post_id: providerPostId, ...metrics });
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
