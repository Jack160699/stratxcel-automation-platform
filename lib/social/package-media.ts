import type { ServiceClient } from "@stratxcel/whatsapp";
import type { PackageMediaKind } from "./package-composition.ts";

const CANDIDATE_POOL_SIZE = 10;

/**
 * Selects a real tenant-scoped asset with the required capability. There is
 * deliberately no text fallback for an image/reel package.
 *
 * Found live (Section 11, Creative Diversity Engine): this used to fetch
 * only the single most-recently-uploaded asset (`limit(1)`), unconditionally
 * -- so a tenant with 5 uploaded photos still had the exact same one photo
 * attached to EVERY package post, forever, and the other 4 were never used
 * at all. `avoidAssetIds` (the asset ids already attached to this
 * authorization's recent posts) lets the caller ask for variety: this
 * fetches a small candidate pool and prefers the newest one NOT in that
 * recently-used set, falling back to the newest candidate outright when
 * every fetched candidate has been used recently (e.g. only one asset
 * exists) -- variety is a preference, never a reason to block a post.
 */
export async function selectPackageMediaAsset(
  service: ServiceClient,
  input: { tenantId: string; ownerId: string; mediaType: PackageMediaKind; avoidAssetIds?: string[] }
) {
  if (input.mediaType === "text") return null;
  const mimePrefix = input.mediaType === "reel" || input.mediaType === "video" ? "video/" : "image/";
  const { data } = await service
    .from("social_media_assets")
    .select("id,mime_type")
    .eq("tenant_id", input.tenantId)
    .eq("owner_id", input.ownerId)
    .like("mime_type", `${mimePrefix}%`)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);
  const candidates = (data ?? []) as Array<{ id: string; mime_type: string }>;
  if (!candidates.length) throw new Error("media_capability_unavailable");
  const avoid = new Set(input.avoidAssetIds ?? []);
  return candidates.find((asset) => !avoid.has(asset.id)) ?? candidates[0];
}
