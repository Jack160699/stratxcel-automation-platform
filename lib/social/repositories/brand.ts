import type { OwnerContext } from "../db-context.ts";
import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";
import type { createSupabaseServiceClient } from "../../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

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

/**
 * Products/audiences/pillars/rules/source_material have no per-item database
 * id — they're positions within a JSON array on one owner-scoped row. This
 * is the one place that replaces an item in place by index, so every "edit"
 * action shares the exact same, tested merge semantics: an out-of-range
 * index is a safe no-op (never appends or throws), and untouched fields on
 * the item are preserved rather than dropped.
 */
export function replaceAtIndex<T>(arr: T[], index: number, patch: Partial<T>): T[] {
  if (index < 0 || index >= arr.length) return arr;
  return arr.map((item, i) => (i === index ? { ...item, ...patch } : item));
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

/**
 * Tenant mode reads the profile already explicitly bound to this tenant
 * (see assignBrandProfileToTenant in package-tenant-assignment.ts) — never
 * a fuzzy "pick any" lookup. No bound profile yet -> the same empty
 * DEFAULT_PROFILE fallback owner-mode already uses when nothing is saved,
 * so a session with no Brand Brain configured degrades safely instead of
 * erroring.
 */
export async function getBrandProfile(ctx: AgentActorContext): Promise<BrandProfileRow> {
  if (isTenantAgentContext(ctx)) {
    const { data } = await ctx.supabase.from("social_brand_profiles").select("*").eq("tenant_id", ctx.tenantId).maybeSingle();
    if (data) return data as BrandProfileRow;
    return { id: "", owner_id: "", ...DEFAULT_PROFILE, updated_at: "" };
  }
  const { data } = await ctx.supabase.from("social_brand_profiles").select("*").eq("owner_id", ctx.ownerId).maybeSingle();
  if (data) return data as BrandProfileRow;
  return { id: "", owner_id: ctx.ownerId, ...DEFAULT_PROFILE, updated_at: "" };
}

export async function getBoundBrandProfile(ctx: OwnerContext, profileId: string, tenantId: string): Promise<BrandProfileRow | null> {
  const { data } = await ctx.supabase.from("social_brand_profiles").select("*").eq("id", profileId).eq("tenant_id", tenantId).maybeSingle();
  return data as BrandProfileRow | null;
}

/**
 * STRATXCEL final closure brief: real bug found live while verifying the
 * real StratXcel UI -- app/admin/(shell)/social/brand/page.tsx (the admin
 * "Social Brand" page every staff member would use to view/edit a real
 * customer's Brand Brain) called plain getBrandProfile(ctx) with a bare
 * OwnerContext (requireOwnerContext()'s ownerId = the LOGGED-IN STAFF
 * MEMBER's own auth.uid(), never the tenant being viewed/managed) -- the
 * exact same real class of bug already found and fixed this session for
 * runHealthChecks/listAccounts (lib/social/tenant-social-health.ts), just
 * on a different page. Confirmed live: the admin page showed every field
 * empty ("No products yet", etc.) while StratXcel's real, populated
 * social_brand_profiles row (owner_id 9381030b-..., tenant_id
 * 466e6195-...) sat untouched -- any staff "save" on that page was
 * silently writing into (or creating) a SEPARATE row keyed to the staff
 * member's own owner_id, never StratXcel's real profile.
 *
 * Uses a service-role client + an explicit tenant_id filter (the same
 * pattern already proven this session for tenant-social-health.ts and
 * image-provider-health.ts) rather than routing through
 * AgentTenantContext's RLS-enforced tenant_members path: staff access
 * StratXcel via the real, existing stratxcel_admins admin RLS grant, not
 * tenant membership, so a tenant-mode session client would have no
 * guarantee of a matching RLS policy on this table. real
 * social_brand_profiles rows can carry BOTH owner_id and tenant_id at
 * once (confirmed live against the real StratXcel row -- no XOR
 * constraint currently exists on this table in the live database, despite
 * an unrelated file's comment describing one), so a real existing row's
 * own owner_id is preserved verbatim (an UPDATE by the row's real id,
 * never touching owner_id) rather than guessed or overwritten with the
 * acting staff member's identity.
 */
export async function getBrandProfileForTenant(service: ServiceClient, tenantId: string): Promise<BrandProfileRow> {
  const { data } = await service.from("social_brand_profiles").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (data) return data as BrandProfileRow;
  return { id: "", owner_id: "", ...DEFAULT_PROFILE, updated_at: "" };
}

export async function upsertBrandProfileForTenant(
  service: ServiceClient,
  tenantId: string,
  patch: Partial<Omit<BrandProfileRow, "id" | "owner_id" | "updated_at">>
): Promise<void> {
  const current = await getBrandProfileForTenant(service, tenantId);
  const merged = { ...current, ...patch };
  const fields = {
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
  };

  if (current.id) {
    // A real, existing tenant-scoped row -- update it by its own real id,
    // never touching owner_id (whatever real value it already carries,
    // populated or not, stays exactly as it was).
    const { error } = await service.from("social_brand_profiles").update(fields).eq("id", current.id);
    if (error) throw new Error(error.message);
    return;
  }

  // No real row for this tenant yet -- insert a genuinely new one,
  // tenant_id-scoped, owner_id intentionally omitted (null) rather than
  // guessed from the acting staff member's own identity.
  const { error } = await service.from("social_brand_profiles").insert({ tenant_id: tenantId, ...fields });
  if (error) throw new Error(error.message);
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
