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
 *
 * STRATXCEL FINAL REMAINING BLOCKERS mission (Sections 4-8): before this,
 * the ONLY filters here were tenant_id/owner_id/mime_type prefix -- a
 * manually-designed Creative Studio poster (heavy headline/CTA/bullet-list
 * text), the business's own raw logo file, or even a 64x64 logo-mark PNG
 * variant were all structurally valid candidates for automatic selection
 * as a post's main photo. Confirmed live on the real StratXcel tenant: 28
 * of its 34 real assets were exactly this kind of unsafe candidate.
 * `autopilot_eligible` (social_media_assets_autopilot_classification
 * migration) is the real, DB-level hard boundary (Section 8) -- an asset
 * classified MARKETING_GRAPHIC/POSTER/BANNER/BRAND_LOGO/etc. can never
 * reach this candidate pool at all, regardless of what any caller intends.
 * Defaults true for any never-classified asset (this is a fail-open
 * default, not fail-closed, deliberately: it never retroactively breaks
 * an asset nobody has ever flagged as unsafe) -- ineligibility is only
 * ever a real, explicit, evidenced classification action.
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
    .eq("autopilot_eligible", true)
    .like("mime_type", `${mimePrefix}%`)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);
  const candidates = (data ?? []) as Array<{ id: string; mime_type: string }>;
  if (!candidates.length) throw new Error("media_capability_unavailable");
  const avoid = new Set(input.avoidAssetIds ?? []);
  return candidates.find((asset) => !avoid.has(asset.id)) ?? candidates[0];
}
