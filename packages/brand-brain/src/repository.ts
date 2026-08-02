import type { ServiceClient } from "./db.ts";
import type { BrandBrainContent, BrandBrainRow, BrandBrainVersionRow } from "./types.ts";

/**
 * Brand Brain is versioned, never overwritten in place: getCurrentBrandBrain
 * always reads brand_brains.current_version and joins to the matching
 * version row, so a mission that captured `brand_brain_version: 3` at
 * DRAFT time keeps reading version 3's content even if the customer edits
 * the Brand Brain again while the mission is RUNNING — critical for
 * @stratxcel/hermes's context compiler, which must hand Hermes the exact
 * version a mission was estimated against, not whatever is newest.
 */
export async function getCurrentBrandBrain(
  supabase: ServiceClient,
  tenantId: string
): Promise<(BrandBrainRow & { content: BrandBrainContent }) | null> {
  const { data: brainRow, error } = await supabase
    .from("brand_brains")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`getCurrentBrandBrain: ${error.message}`);
  if (!brainRow) return null;

  const version = await getBrandBrainVersion(supabase, tenantId, brainRow.current_version);
  return { ...(brainRow as BrandBrainRow), content: version?.content ?? {} };
}

export async function getBrandBrainVersion(
  supabase: ServiceClient,
  tenantId: string,
  version: number
): Promise<BrandBrainVersionRow | null> {
  const { data, error } = await supabase
    .from("brand_brain_versions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error(`getBrandBrainVersion: ${error.message}`);
  return (data as BrandBrainVersionRow) ?? null;
}

export async function saveBrandBrainVersion(
  supabase: ServiceClient,
  input: { tenantId: string; content: BrandBrainContent; createdBy: string | null }
): Promise<BrandBrainVersionRow> {
  const { data: existing } = await supabase
    .from("brand_brains")
    .select("current_version")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  const nextVersion = (existing?.current_version ?? 0) + 1;

  const { data: versionRow, error: versionError } = await supabase
    .from("brand_brain_versions")
    .insert({
      tenant_id: input.tenantId,
      version: nextVersion,
      content: input.content,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (versionError) throw new Error(`saveBrandBrainVersion: ${versionError.message}`);

  const { error: upsertError } = await supabase.from("brand_brains").upsert({
    tenant_id: input.tenantId,
    current_version: nextVersion,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw new Error(`saveBrandBrainVersion: failed to update pointer: ${upsertError.message}`);

  return versionRow as BrandBrainVersionRow;
}
