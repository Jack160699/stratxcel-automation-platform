import crypto from "node:crypto";
import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";
import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";
import { extensionForName, validateMediaMetadata } from "../media-validation";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export const MEDIA_BUCKET = "social-agent-attachments";

export interface MediaAssetRow {
  id: string;
  owner_id: string;
  source_attachment_id: string | null;
  storage_bucket: typeof MEDIA_BUCKET;
  storage_path: string;
  original_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  status: "UPLOADING" | "READY" | "FAILED";
  created_at: string;
  updated_at: string;
}

function safeFileName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-");
  return normalized.slice(0, 120) || "media";
}

async function storedObjectMetadata(ctx: OwnerContext, path: string) {
  const parts = path.split("/");
  const objectName = parts.pop();
  if (!objectName) throw new Error("Invalid storage path");
  const { data, error } = await ctx.supabase.storage.from(MEDIA_BUCKET).list(parts.join("/"), {
    search: objectName,
    limit: 2,
  });
  if (error) throw new Error(error.message);
  const object = data?.find((item) => item.name === objectName);
  if (!object) throw new Error("Uploaded media object was not found");
  const metadata = object.metadata as { size?: number; mimetype?: string } | null;
  return {
    sizeBytes: Number(metadata?.size ?? 0),
    mimeType: String(metadata?.mimetype ?? ""),
  };
}

export async function prepareMediaAsset(
  ctx: OwnerContext,
  input: { name: string; mimeType: string; sizeBytes: number }
): Promise<{ asset: MediaAssetRow; path: string; token: string; signedUrl: string }> {
  const errorMessage = validateMediaMetadata(input);
  if (errorMessage) throw new Error(errorMessage);
  const id = crypto.randomUUID();
  const path = `${ctx.ownerId}/media/${id}-${safeFileName(input.name)}`;
  const extension = extensionForName(input.name);
  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .insert({
      id,
      owner_id: ctx.ownerId,
      storage_path: path,
      original_name: input.name.slice(0, 255),
      extension,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      status: "UPLOADING",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Media metadata insert failed");
  const { data: signed, error: signedError } = await ctx.supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (signedError || !signed) {
    await ctx.supabase.from("social_media_assets").delete().eq("id", id);
    throw new Error(signedError?.message ?? "Could not prepare private media upload");
  }
  return {
    asset: data as MediaAssetRow,
    path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  };
}

export async function finalizeMediaAsset(ctx: OwnerContext, assetId: string): Promise<MediaAssetRow> {
  const { data } = await ctx.supabase
    .from("social_media_assets")
    .select("*")
    .eq("id", assetId)
    .eq("owner_id", ctx.ownerId)
    .eq("status", "UPLOADING")
    .maybeSingle();
  const asset = data as MediaAssetRow | null;
  if (!asset) throw new Error("Pending media asset not found");
  const stored = await storedObjectMetadata(ctx, asset.storage_path);
  const validationError = validateMediaMetadata({
    name: asset.original_name,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
  });
  if (validationError || stored.mimeType !== asset.mime_type || stored.sizeBytes !== Number(asset.size_bytes)) {
    await ctx.supabase.storage.from(MEDIA_BUCKET).remove([asset.storage_path]);
    await ctx.supabase.from("social_media_assets").update({ status: "FAILED" }).eq("id", asset.id);
    throw new Error(validationError ?? "Uploaded media does not match the declared file metadata.");
  }
  const { data: updated, error } = await ctx.supabase
    .from("social_media_assets")
    .update({ status: "READY", updated_at: new Date().toISOString() })
    .eq("id", asset.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(error?.message ?? "Could not finalize media upload");
  return updated as MediaAssetRow;
}

export async function ensureMediaAssetForAttachment(
  ctx: OwnerContext,
  attachment: {
    id: string;
    owner_id: string;
    storage_path: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    media_asset_id?: string | null;
  }
): Promise<MediaAssetRow> {
  if (attachment.owner_id !== ctx.ownerId) throw new Error("Attachment ownership mismatch");
  const validationError = validateMediaMetadata({
    name: attachment.original_name,
    mimeType: attachment.mime_type,
    sizeBytes: Number(attachment.size_bytes),
  });
  if (validationError) throw new Error(validationError);
  if (attachment.media_asset_id) {
    const assets = await getMediaAssetsByIds(ctx, [attachment.media_asset_id]);
    if (assets[0]) return assets[0];
  }
  const { data: existing } = await ctx.supabase
    .from("social_media_assets")
    .select("*")
    .eq("source_attachment_id", attachment.id)
    .maybeSingle();
  if (existing) return existing as MediaAssetRow;

  const stored = await storedObjectMetadata(ctx, attachment.storage_path);
  if (stored.mimeType !== attachment.mime_type || stored.sizeBytes !== Number(attachment.size_bytes)) {
    throw new Error("Uploaded media does not match the declared file metadata.");
  }
  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .insert({
      owner_id: ctx.ownerId,
      source_attachment_id: attachment.id,
      storage_path: attachment.storage_path,
      original_name: attachment.original_name,
      extension: extensionForName(attachment.original_name),
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
      status: "READY",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not ingest media attachment");
  await ctx.supabase.from("social_agent_attachments").update({ media_asset_id: data.id }).eq("id", attachment.id);
  return data as MediaAssetRow;
}

export async function getMediaAssetsByIds(ctx: OwnerContext, ids: string[]): Promise<MediaAssetRow[]> {
  if (!ids.length) return [];
  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .eq("status", "READY")
    .in("id", [...new Set(ids)]);
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAssetRow[];
}

/**
 * A short-lived signed URL for displaying an owned media asset as a
 * thumbnail (e.g. in the Copilot "Ready to publish" approval card) — never
 * for publishing itself (that path stays on resolveMediaForPublish's
 * service-role signed URL, minted only while a real job is running). Uses
 * the caller's OWNER-SCOPED client, not the service client, so RLS/ownership
 * is enforced by Postgres/Storage policy, not by this function's logic.
 */
export async function getMediaAssetPreviewUrl(ctx: OwnerContext, assetId: string): Promise<{ url: string; mimeType: string } | null> {
  const assets = await getMediaAssetsByIds(ctx, [assetId]);
  const asset = assets[0];
  if (!asset) return null;
  const { data, error } = await ctx.supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 10 * 60);
  if (error || !data) return null;
  return { url: data.signedUrl, mimeType: asset.mime_type };
}

export async function ingestAttachmentMedia(ctx: OwnerContext, attachmentId: string) {
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("owner_id", ctx.ownerId)
    .maybeSingle();
  if (!data) throw new Error("Media attachment not found or owned by another account.");
  const asset = await ensureMediaAssetForAttachment(ctx, data);
  return {
    id: asset.id,
    attachmentId,
    name: asset.original_name,
    mimeType: asset.mime_type,
    sizeBytes: asset.size_bytes,
    status: asset.status,
  };
}

async function requireAssets(ctx: OwnerContext, ids: string[]) {
  const unique = [...new Set(ids)];
  const assets = await getMediaAssetsByIds(ctx, unique);
  if (assets.length !== unique.length) throw new Error("One or more media assets are missing or belong to another owner.");
  return assets;
}

export async function attachMediaToMaster(ctx: AgentActorContext, masterId: string, assetIds: string[], replace = false) {
  if (isTenantAgentContext(ctx)) throw new Error("Media attachments aren't available in this workspace's Copilot yet.");
  const [{ data: master }, assets] = await Promise.all([
    ctx.supabase.from("content_master").select("id").eq("id", masterId).maybeSingle(),
    requireAssets(ctx, assetIds),
  ]);
  if (!master) throw new Error("Content master not found");
  if (replace) {
    const { error } = await ctx.supabase.from("social_content_master_media").delete().eq("master_id", masterId);
    if (error) throw new Error(error.message);
  }
  if (assets.length) {
    const { error } = await ctx.supabase.from("social_content_master_media").upsert(
      assets.map((asset, position) => ({ master_id: masterId, asset_id: asset.id, position })),
      { onConflict: "master_id,asset_id" }
    );
    if (error) throw new Error(error.message);
  }
  return { masterId, assetIds: assets.map((asset) => asset.id), mode: replace ? "replace" : "append" };
}

export async function attachMediaToVariant(ctx: AgentActorContext, variantId: string, assetIds: string[], replace = false) {
  if (isTenantAgentContext(ctx)) throw new Error("Media attachments aren't available in this workspace's Copilot yet.");
  const [{ data: variant }, assets] = await Promise.all([
    ctx.supabase.from("content_variants").select("id, master_id").eq("id", variantId).maybeSingle(),
    requireAssets(ctx, assetIds),
  ]);
  if (!variant) throw new Error("Content variant not found");
  if (replace) {
    const { error } = await ctx.supabase.from("social_content_variant_media").delete().eq("variant_id", variantId);
    if (error) throw new Error(error.message);
  }
  if (assets.length) {
    const { error } = await ctx.supabase.from("social_content_variant_media").upsert(
      assets.map((asset, position) => ({ variant_id: variantId, asset_id: asset.id, position })),
      { onConflict: "variant_id,asset_id" }
    );
    if (error) throw new Error(error.message);
  }
  return { variantId, assetIds: assets.map((asset) => asset.id), mode: replace ? "replace" : "append" };
}

export async function inspectContentMedia(
  ctx: AgentActorContext,
  input: { masterId?: string; variantId?: string; title?: string }
) {
  let masterQuery = ctx.supabase
    .from("content_master")
    .select("id, title, objective, content_pillar, source_content_id, status");
  if (input.masterId) masterQuery = masterQuery.eq("id", input.masterId);
  else if (input.title) masterQuery = masterQuery.ilike("title", input.title);
  else if (input.variantId) {
    const { data: variant } = await ctx.supabase
      .from("content_variants")
      .select("master_id")
      .eq("id", input.variantId)
      .maybeSingle();
    if (!variant) throw new Error("Content variant not found");
    masterQuery = masterQuery.eq("id", variant.master_id);
  } else {
    throw new Error("Provide masterId, variantId, or an exact title.");
  }
  const { data: master } = await masterQuery.maybeSingle();
  if (!master) throw new Error("Content item not found");
  const [{ data: variants }, { data: masterLinks }] = await Promise.all([
    ctx.supabase
      .from("content_variants")
      .select("id, platform, format, objective, caption, hashtags, media_urls, creative_spec, status")
      .eq("master_id", master.id)
      .order("created_at"),
    ctx.supabase
      .from("social_content_master_media")
      .select("position, social_media_assets(id, original_name, mime_type, size_bytes, status)")
      .eq("master_id", master.id)
      .order("position"),
  ]);
  const variantRows = await Promise.all(
    (variants ?? []).map(async (variant) => {
      const { data: links } = await ctx.supabase
        .from("social_content_variant_media")
        .select("position, social_media_assets(id, original_name, mime_type, size_bytes, status)")
        .eq("variant_id", variant.id)
        .order("position");
      return { ...variant, mediaAssets: links ?? [], inheritsMasterMedia: !links?.length };
    })
  );
  return { master, masterMediaAssets: masterLinks ?? [], variants: variantRows };
}

export async function updateContentVariant(
  ctx: AgentActorContext,
  input: {
    variantId: string;
    caption?: string;
    hashtags?: string[];
    format?: string;
    mediaAssetIds?: string[];
    youtubePrivacyStatus?: "private" | "unlisted" | "public";
  }
) {
  if (isTenantAgentContext(ctx) && input.mediaAssetIds !== undefined) {
    throw new Error("Media attachments aren't available in this workspace's Copilot yet.");
  }
  const { data: current } = await ctx.supabase
    .from("content_variants")
    .select("id, platform, creative_spec")
    .eq("id", input.variantId)
    .maybeSingle();
  if (!current) throw new Error("Content variant not found");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.caption !== undefined) patch.caption = input.caption;
  if (input.hashtags !== undefined) patch.hashtags = input.hashtags;
  if (input.format !== undefined) patch.format = input.format;
  if (input.youtubePrivacyStatus !== undefined) {
    if (current.platform !== "youtube") throw new Error("YouTube privacy can only be set on a YouTube variant.");
    patch.creative_spec = {
      ...((current.creative_spec as Record<string, unknown>) ?? {}),
      youtube_privacy_status: input.youtubePrivacyStatus,
    };
  }
  const { error } = await ctx.supabase.from("content_variants").update(patch).eq("id", input.variantId);
  if (error) throw new Error(error.message);
  if (input.mediaAssetIds !== undefined) {
    await attachMediaToVariant(ctx, input.variantId, input.mediaAssetIds, true);
  }
  return inspectContentMedia(ctx, { variantId: input.variantId });
}

async function associationAssetIds(service: ServiceClient, table: string, key: string, id: string) {
  const { data, error } = await service.from(table).select("asset_id, position").eq(key, id).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.asset_id as string);
}

export async function resolveMediaForPublish(
  service: ServiceClient,
  variant: { id: string; master_id: string; media_urls: string[] }
) {
  let assetIds = await associationAssetIds(service, "social_content_variant_media", "variant_id", variant.id);
  const inherited = assetIds.length === 0;
  if (inherited) {
    assetIds = await associationAssetIds(service, "social_content_master_media", "master_id", variant.master_id);
  }
  if (!assetIds.length) return { urls: variant.media_urls ?? [], assets: [], inherited };
  const { data, error } = await service
    .from("social_media_assets")
    .select("*")
    .in("id", assetIds)
    .eq("status", "READY");
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((asset) => [asset.id as string, asset as MediaAssetRow]));
  const assets = assetIds.map((id) => byId.get(id)).filter((asset): asset is MediaAssetRow => Boolean(asset));
  if (assets.length !== assetIds.length) throw new Error("One or more attached media assets are unavailable.");
  const signedUrls = await Promise.all(
    assets.map(async (asset) => {
      const { data: signed, error: signedError } = await service.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, 60 * 60);
      if (signedError || !signed) throw new Error(signedError?.message ?? "Could not prepare media for publishing");
      return signed.signedUrl;
    })
  );
  return { urls: signedUrls, assets, inherited };
}

export async function removeUnattachedMediaAsset(ctx: OwnerContext, assetId: string) {
  const { data } = await ctx.supabase
    .from("social_media_assets")
    .select("*")
    .eq("id", assetId)
    .eq("owner_id", ctx.ownerId)
    .is("source_attachment_id", null)
    .maybeSingle();
  const asset = data as MediaAssetRow | null;
  if (!asset) throw new Error("Media asset cannot be removed.");
  const [{ count: masterCount }, { count: variantCount }] = await Promise.all([
    ctx.supabase.from("social_content_master_media").select("*", { count: "exact", head: true }).eq("asset_id", asset.id),
    ctx.supabase.from("social_content_variant_media").select("*", { count: "exact", head: true }).eq("asset_id", asset.id),
  ]);
  if ((masterCount ?? 0) + (variantCount ?? 0) > 0) throw new Error("Attached media cannot be removed.");
  const { error: storageError } = await ctx.supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
  if (storageError) throw new Error(storageError.message);
  const { error } = await ctx.supabase.from("social_media_assets").delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
}
