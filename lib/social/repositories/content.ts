import { createSupabaseServiceClient } from "../../supabase/service";
import { requireContentObjective, requirePlatform } from "../content-options";
import type { OwnerContext } from "../db-context";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface ContentMasterRow {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  title: string;
  master_idea: string;
  objective: string;
  content_pillar: string;
  research: unknown[];
  evergreen: boolean;
  source_content_id: string | null;
  status: string; // 'IDEA' | 'APPROVED' | 'ARCHIVED' ...
  created_at: string;
  updated_at: string;
}

export interface ContentVariantRow {
  id: string;
  master_id: string;
  platform: string;
  format: string;
  objective: string;
  caption: string;
  hashtags: string[];
  media_urls: string[];
  creative_spec: Record<string, unknown>;
  script: unknown;
  scheduled_at: string | null;
  published_at: string | null;
  status: string; // 'GENERATING' | 'READY' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'
  qa_scores: Record<string, unknown>;
  generation_cost_cents: number;
  created_at: string;
  updated_at: string;
}

export async function listContentMaster(ctx: OwnerContext, limit = 50): Promise<ContentMasterRow[]> {
  const { data } = await ctx.supabase
    .from("content_master")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ContentMasterRow[];
}

export async function createContentMaster(
  ctx: OwnerContext,
  input: {
    campaignId?: string | null;
    title: string;
    masterIdea: string;
    objective: string;
    contentPillar: string;
    evergreen?: boolean;
  }
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("content_master")
    .insert({
      owner_id: ctx.ownerId,
      campaign_id: input.campaignId ?? null,
      title: input.title,
      master_idea: input.masterIdea,
      objective: requireContentObjective(input.objective),
      content_pillar: input.contentPillar,
      evergreen: input.evergreen ?? false,
      status: "IDEA",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "content_master insert failed");
  return data.id as string;
}

export async function listVariantsForMaster(ctx: OwnerContext, masterId: string): Promise<ContentVariantRow[]> {
  const { data } = await ctx.supabase.from("content_variants").select("*").eq("master_id", masterId).order("created_at", { ascending: false });
  return (data ?? []) as ContentVariantRow[];
}

export async function listRecentVariants(ctx: OwnerContext, limit = 50) {
  const { data } = await ctx.supabase
    .from("content_variants")
    .select("*, content_master(title, content_pillar)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function createContentVariant(
  ctx: OwnerContext,
  input: {
    masterId: string;
    platform: string;
    format: string;
    objective: string;
    caption: string;
    hashtags: string[];
    mediaUrls: string[];
    creativeSpec?: Record<string, unknown>;
    /** Deterministic generation key for idempotent reuse within a review revision. */
    generationKey?: string | null;
  }
): Promise<{ id: string; platform: string; reused: boolean; generationKey: string | null }> {
  const platform = requirePlatform(input.platform, "platform");
  const generationKey = input.generationKey?.trim() || null;

  if (generationKey) {
    const { data: existingRows } = await ctx.supabase
      .from("content_variants")
      .select("id, platform, creative_spec")
      .eq("master_id", input.masterId)
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(25);
    const reused = (existingRows ?? []).find((row) => {
      const spec = (row.creative_spec ?? {}) as Record<string, unknown>;
      return spec.generationKey === generationKey;
    });
    if (reused?.id) {
      return { id: reused.id as string, platform, reused: true, generationKey };
    }
  }

  const creativeSpec = {
    ...(input.creativeSpec ?? {}),
    ...(generationKey ? { generationKey } : {}),
  };

  const { data, error } = await ctx.supabase
    .from("content_variants")
    .insert({
      master_id: input.masterId,
      platform,
      format: input.format,
      objective: requireContentObjective(input.objective),
      caption: input.caption,
      hashtags: input.hashtags,
      media_urls: input.mediaUrls,
      creative_spec: creativeSpec,
      status: "READY",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "content_variant insert failed");
  return { id: data.id as string, platform, reused: false, generationKey };
}

export async function getVariantForPublish(service: ServiceClient, variantId: string): Promise<ContentVariantRow | null> {
  const { data } = await service.from("content_variants").select("*").eq("id", variantId).maybeSingle();
  return data as ContentVariantRow | null;
}

export async function markVariantStatus(service: ServiceClient, variantId: string, status: string, extra: Record<string, unknown> = {}) {
  await service
    .from("content_variants")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", variantId);
}
