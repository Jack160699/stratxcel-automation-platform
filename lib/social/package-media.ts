import type { ServiceClient } from "@stratxcel/whatsapp";
import type { PackageMediaKind } from "./package-composition.ts";

const CANDIDATE_POOL_SIZE = 10;

/**
 * Selects a real tenant-scoped asset with the required capability. There is
 * deliberately no text fallback for an image/reel package.
 *
 * Variety is a preference, never a reason to block a post: fetches a small
 * candidate pool and prefers the newest one NOT in recently-used set.
 *
 * Visual QA: Prefers source_type='generated' assets (AI-generated editorial photos)
 * over promotional posters/uploads, falling back to eligible assets when needed.
 */
export async function selectPackageMediaAsset(
  service: ServiceClient,
  input: { tenantId: string; ownerId: string; mediaType: PackageMediaKind; avoidAssetIds?: string[] }
) {
  if (input.mediaType === "text") return null;
  const mimePrefix = input.mediaType === "reel" || input.mediaType === "video" ? "video/" : "image/";
  const avoid = new Set(input.avoidAssetIds ?? []);

  // First pass: prefer AI-generated editorial assets (source_type='generated').
  // Real, severe defect found live (StratXcel Marketing Creative Engine
  // repair, 2026-09-06): this pass never filtered on autopilot_eligible at
  // all -- only the second (fallback) pass below did. A tenant's own
  // uploaded-logo variants are source_type:"generated" too (the Logo
  // Engine's own sharp-based variant renderer), so a quarantined
  // (autopilot_eligible=false) logo file still won this "preferred
  // generated asset" pass outright over any real business photo, even
  // after being correctly quarantined. Confirmed live: 4 real automated
  // Social Autopilot posts used a raw logo-variant file (badge/monoDark/
  // monoLight/transparent) as the entire post creative, both before AND
  // after quarantining those exact rows, because this query never checked
  // the flag it was quarantined with.
  const { data: generatedCandidates } = await service
    .from("social_media_assets")
    .select("id,mime_type,source_type")
    .eq("tenant_id", input.tenantId)
    .eq("owner_id", input.ownerId)
    .eq("source_type", "generated")
    .eq("autopilot_eligible", true)
    .like("mime_type", `${mimePrefix}%`)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);

  const generated = (generatedCandidates ?? []) as Array<{ id: string; mime_type: string; source_type: string }>;
  const preferredGenerated = generated.find((asset) => !avoid.has(asset.id)) ?? (generated[0] ?? null);
  if (preferredGenerated) return preferredGenerated;

  // Second pass: fall back to all eligible assets
  const { data: allCandidates } = await service
    .from("social_media_assets")
    .select("id,mime_type,source_type")
    .eq("tenant_id", input.tenantId)
    .eq("owner_id", input.ownerId)
    .eq("autopilot_eligible", true)
    .like("mime_type", `${mimePrefix}%`)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);

  const candidates = (allCandidates ?? []) as Array<{ id: string; mime_type: string; source_type: string }>;
  if (!candidates.length) throw new Error("media_capability_unavailable");
  return candidates.find((asset) => !avoid.has(asset.id)) ?? candidates[0];
}
