import crypto from "node:crypto";
import { requireImageGenerationContext } from "@/lib/image-generation/http";
import { extensionForName, validateMediaMetadata } from "@/lib/social/media-validation";
import { isBrandOrLogoAsset } from "@/lib/social/brand-asset-filter";

import { getCurrentBrandBrain } from "@stratxcel/brand-brain";

export const runtime = "nodejs";

const BUCKET = "social-agent-attachments";
const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function safeName(name: string) {
  return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-").slice(0, 120) || "reference";
}

export async function GET() {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // 1. Fetch current and historical Brand Brain records to cross-reference all logo URLs and variants
  const brandBrainRecords: any[] = [];
  try {
    const currentBrain = await getCurrentBrandBrain(ctx.supabase, ctx.tenantId).catch(() => null);
    if (currentBrain) {
      brandBrainRecords.push(currentBrain);
    }
    const { data: versions } = await ctx.supabase
      .from("brand_brain_versions")
      .select("content")
      .eq("tenant_id", ctx.tenantId)
      .limit(20);
    if (versions) {
      brandBrainRecords.push(...versions);
    }
  } catch {
    // Non-fatal if brand brain lookup fails
  }

  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .select("id,original_name,mime_type,size_bytes,source_type,created_at,storage_bucket,storage_path,provenance")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "READY")
    .in("mime_type", [...REFERENCE_MIME_TYPES])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: "Reference assets could not be loaded" }, { status: 500 });

  // Filter out any brand assets, logo variants, or active brand logos
  const eligibleAssets = (data ?? []).filter((asset) => !isBrandOrLogoAsset(asset, brandBrainRecords)).slice(0, 50);

  const assets = await Promise.all(eligibleAssets.map(async (asset) => {
    const { data: signed } = await ctx.service.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 10 * 60);
    return {
      id: asset.id,
      original_name: asset.original_name,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      source_type: asset.source_type,
      created_at: asset.created_at,
      storage_bucket: asset.storage_bucket,
      storage_path: asset.storage_path,
      provenance: asset.provenance,
      previewUrl: signed?.signedUrl ?? null,
    };
  }));

  return Response.json({ assets });
}

export async function POST(request: Request) {
  const ctx = await requireImageGenerationContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    const body = (await request.json()) as { action?: unknown; assetId?: unknown; name?: unknown; mimeType?: unknown; sizeBytes?: unknown };
    if (body.action === "prepare") {
      if (typeof body.name !== "string" || typeof body.mimeType !== "string" || typeof body.sizeBytes !== "number") {
        throw new Error("File name, type, and size are required");
      }
      const validation = validateMediaMetadata({ name: body.name, mimeType: body.mimeType, sizeBytes: body.sizeBytes });
      if (validation || !REFERENCE_MIME_TYPES.has(body.mimeType) || body.sizeBytes > 20 * 1024 * 1024) {
        throw new Error(validation ?? "References must be PNG, JPEG, or WebP images no larger than 20 MB.");
      }
      const assetId = crypto.randomUUID();
      const path = `${ctx.userId}/${ctx.tenantId}/creative-references/${assetId}-${safeName(body.name)}`;
      const { data: asset, error } = await ctx.supabase.from("social_media_assets").insert({
        id: assetId,
        owner_id: ctx.userId,
        tenant_id: ctx.tenantId,
        storage_bucket: BUCKET,
        storage_path: path,
        original_name: body.name.slice(0, 255),
        extension: extensionForName(body.name),
        mime_type: body.mimeType,
        size_bytes: body.sizeBytes,
        status: "UPLOADING",
        source_type: "upload",
      }).select("*").single();
      if (error || !asset) throw new Error("Reference upload could not be prepared");
      const { data: signed, error: signedError } = await ctx.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (signedError || !signed) {
        await ctx.supabase.from("social_media_assets").delete().eq("id", assetId);
        throw new Error("Private upload could not be prepared");
      }
      return Response.json({ asset, path, token: signed.token, signedUrl: signed.signedUrl }, { status: 201 });
    }
    if (body.action === "finalize") {
      if (typeof body.assetId !== "string") throw new Error("Reference asset id is required");
      const { data: asset } = await ctx.supabase
        .from("social_media_assets")
        .select("*")
        .eq("id", body.assetId)
        .eq("tenant_id", ctx.tenantId)
        .eq("owner_id", ctx.userId)
        .eq("status", "UPLOADING")
        .maybeSingle();
      if (!asset) throw new Error("Pending reference upload was not found");
      const parts = String(asset.storage_path).split("/");
      const objectName = parts.pop();
      const { data: objects, error: listError } = await ctx.supabase.storage.from(BUCKET).list(parts.join("/"), { search: objectName, limit: 2 });
      const object = objects?.find((item) => item.name === objectName);
      const metadata = object?.metadata as { size?: number; mimetype?: string } | undefined;
      if (listError || !object || Number(metadata?.size) !== Number(asset.size_bytes) || String(metadata?.mimetype) !== asset.mime_type) {
        await ctx.supabase.storage.from(BUCKET).remove([asset.storage_path]);
        await ctx.supabase.from("social_media_assets").update({ status: "FAILED" }).eq("id", asset.id);
        throw new Error("Uploaded reference did not match its declared metadata");
      }
      const { data: updated, error } = await ctx.supabase
        .from("social_media_assets")
        .update({ status: "READY", updated_at: new Date().toISOString() })
        .eq("id", asset.id)
        .select("*")
        .single();
      if (error || !updated) throw new Error("Reference upload could not be finalized");
      return Response.json({ asset: updated });
    }
    throw new Error("Unknown reference action");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reference upload failed" }, { status: 400 });
  }
}
