import type { OwnerContext } from "../db-context.ts";

export interface ProviderConfigRow {
  id: string;
  owner_id: string;
  kind: "AI" | "MEDIA";
  provider: string;
  roles: string[];
  enabled: boolean;
  config: Record<string, unknown>;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProviderConfigs(ctx: OwnerContext, kind?: "AI" | "MEDIA"): Promise<ProviderConfigRow[]> {
  let query = ctx.supabase.from("social_provider_configs").select("*");
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  return (data ?? []) as ProviderConfigRow[];
}

export async function recordProviderTest(ctx: OwnerContext, kind: "AI" | "MEDIA", provider: string, ok: boolean, error?: string) {
  await ctx.supabase.from("social_provider_configs").upsert(
    {
      owner_id: ctx.ownerId,
      kind,
      provider,
      last_tested_at: new Date().toISOString(),
      last_test_ok: ok,
      last_error: error ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,kind,provider" }
  );
}
