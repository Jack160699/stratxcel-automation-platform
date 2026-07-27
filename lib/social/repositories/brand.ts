import type { OwnerContext } from "../db-context";

export interface BrandProfileRow {
  id: string;
  owner_id: string;
  identity: { name?: string; industry?: string; positioning?: string; business_model?: string; description?: string };
  audiences: Array<{ name: string; description?: string; pain_points?: string }>;
  voice: { tone: string[]; blocked_phrases: string[]; forbidden_claims: string[] };
  visual: { colors: string[]; priorities: string[] };
  goals: unknown[];
  competitors: unknown[];
  source_material: Array<{ kind: string; title: string; content?: string; source_url?: string }>;
  products: Array<{ name: string; description?: string; audience?: string; pain_points?: string; benefits?: string; cta?: string; url?: string }>;
  content_pillars: Array<{ name: string; description?: string }>;
  rules: Array<{ kind: string; text: string }>;
  updated_at: string;
}

const DEFAULT_PROFILE: Omit<BrandProfileRow, "id" | "owner_id" | "updated_at"> = {
  identity: {},
  audiences: [],
  voice: { tone: [], blocked_phrases: [], forbidden_claims: [] },
  visual: { colors: [], priorities: [] },
  goals: [],
  competitors: [],
  source_material: [],
  products: [],
  content_pillars: [],
  rules: [],
};

export async function getBrandProfile(ctx: OwnerContext): Promise<BrandProfileRow> {
  const { data } = await ctx.supabase.from("social_brand_profiles").select("*").eq("owner_id", ctx.ownerId).maybeSingle();
  if (data) return data as BrandProfileRow;
  return { id: "", owner_id: ctx.ownerId, ...DEFAULT_PROFILE, updated_at: "" };
}

export async function upsertBrandProfile(ctx: OwnerContext, patch: Partial<Omit<BrandProfileRow, "id" | "owner_id" | "updated_at">>) {
  const current = await getBrandProfile(ctx);
  const merged = { ...current, ...patch };
  const { error } = await ctx.supabase.from("social_brand_profiles").upsert(
    {
      owner_id: ctx.ownerId,
      identity: merged.identity,
      audiences: merged.audiences,
      voice: merged.voice,
      visual: merged.visual,
      goals: merged.goals,
      competitors: merged.competitors,
      source_material: merged.source_material,
      products: merged.products,
      content_pillars: merged.content_pillars,
      rules: merged.rules,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (error) throw new Error(error.message);
}
