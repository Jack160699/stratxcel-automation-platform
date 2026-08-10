import type { ServiceClient } from "@stratxcel/whatsapp";
import { dedupeCaptionForPreview } from "./agent/caption-format.ts";
import { platformLabel } from "./agent/publish-outcome-classify.ts";
import type { PublishActionPreview } from "./agent/action-preview.ts";

/**
 * Package Autopilot preview — same deterministic publish-payload shape the
 * Social Copilot approval card uses (PublishActionPreview). Resolved fresh
 * from persisted queue item → account + variant + ordered media. Never a
 * caption-only fake preview.
 */

async function variantMediaAssetIds(service: ServiceClient, variantId: string, masterId: string | null): Promise<string[]> {
  const { data: variantMedia } = await service
    .from("social_content_variant_media")
    .select("asset_id")
    .eq("variant_id", variantId)
    .order("position");
  if (variantMedia?.length) return variantMedia.map((row) => row.asset_id as string);
  if (!masterId) return [];
  const { data: masterMedia } = await service
    .from("social_content_master_media")
    .select("asset_id")
    .eq("master_id", masterId)
    .order("position");
  return (masterMedia ?? []).map((row) => row.asset_id as string);
}

export interface PackagePublishPreview extends PublishActionPreview {
  queueItemId: string;
  media: Array<{ assetId: string; url: string; mimeType: string }>;
}

export async function getPackageQueueItemPreview(
  service: ServiceClient,
  input: { queueItemId: string; tenantId: string }
): Promise<PackagePublishPreview | null> {
  const { data: item } = await service
    .from("social_autopilot_queue_items")
    .select("id, tenant_id, account_id, variant_id, scheduled_at, status")
    .eq("id", input.queueItemId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!item || !item.variant_id) return null;

  const [{ data: account }, { data: variant }] = await Promise.all([
    service.from("social_accounts").select("platform, username, display_name, avatar_url").eq("id", item.account_id).maybeSingle(),
    service.from("content_variants").select("platform, caption, hashtags, master_id").eq("id", item.variant_id).maybeSingle(),
  ]);
  if (!variant) return null;

  const platform = String(account?.platform ?? variant.platform ?? "").toLowerCase() || undefined;
  const hashtags = Array.isArray(variant.hashtags) ? (variant.hashtags as string[]) : [];
  const mediaAssetIds = await variantMediaAssetIds(service, item.variant_id, variant.master_id ?? null);

  const media: PackagePublishPreview["media"] = [];
  if (mediaAssetIds.length) {
    const { data: assets } = await service
      .from("social_media_assets")
      .select("id, mime_type, storage_bucket, storage_path")
      .in("id", mediaAssetIds);
    const byId = new Map((assets ?? []).map((row) => [row.id as string, row]));
    for (const assetId of mediaAssetIds) {
      const asset = byId.get(assetId);
      if (!asset) continue;
      const { data: signed, error } = await service.storage.from(asset.storage_bucket as string).createSignedUrl(asset.storage_path as string, 10 * 60);
      if (error || !signed?.signedUrl) continue;
      media.push({ assetId, url: signed.signedUrl, mimeType: String(asset.mime_type) });
    }
  }

  return {
    actionId: item.id,
    queueItemId: item.id,
    tool: "schedule_post",
    platform,
    platformLabel: platform ? platformLabel(platform) : undefined,
    accountLabel: account?.display_name || account?.username || undefined,
    accountHandle: account?.username || undefined,
    accountAvatarUrl: account?.avatar_url || undefined,
    caption: variant.caption ? dedupeCaptionForPreview(variant.caption, hashtags) : undefined,
    hashtags,
    scheduledAt: item.scheduled_at,
    isImmediate: false,
    mediaAssetIds,
    mediaMimeTypes: media.map((item) => item.mimeType),
    media,
    shadowMode: false,
  };
}
