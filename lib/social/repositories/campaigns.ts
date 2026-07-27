import type { OwnerContext } from "../db-context";

export interface CampaignRow {
  id: string;
  owner_id: string;
  name: string;
  goal: string;
  starts_at: string | null;
  ends_at: string | null;
  platforms: string[];
  audience: Record<string, unknown>;
  offer: string | null;
  landing_page: string | null;
  cta: string | null;
  priority: number;
  budget_cents: number;
  status: string; // 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETE'
  created_at: string;
}

export async function listCampaigns(ctx: OwnerContext): Promise<CampaignRow[]> {
  const { data } = await ctx.supabase.from("social_campaigns").select("*").order("created_at", { ascending: false });
  return (data ?? []) as CampaignRow[];
}

export async function createCampaign(
  ctx: OwnerContext,
  input: { name: string; goal: string; platforms: string[]; offer?: string | null; cta?: string | null; budgetCents?: number }
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("social_campaigns")
    .insert({
      owner_id: ctx.ownerId,
      name: input.name,
      goal: input.goal,
      platforms: input.platforms,
      offer: input.offer ?? null,
      cta: input.cta ?? null,
      budget_cents: input.budgetCents ?? 0,
      status: "DRAFT",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "campaign insert failed");
  return data.id as string;
}

export async function setCampaignStatus(ctx: OwnerContext, id: string, status: string) {
  await ctx.supabase.from("social_campaigns").update({ status }).eq("id", id);
}
