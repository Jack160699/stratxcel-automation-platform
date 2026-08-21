import crypto from "node:crypto";
import { requireTenantContext, requireTenantReadContext, requireTenantReadPermission } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { extensionForName, validateMediaMetadata } from "@/lib/social/media-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "social-agent-attachments";
const SHOP_PROFILE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SHOP_PROFILE_PURPOSE = "shop_profile_photo";

/**
 * Shop Profile photo gallery — reuses the existing social_media_assets
 * table/bucket the AI-reference-image feature already established
 * (app/api/platform/image-generations/references/route.ts is the sibling
 * this mirrors) rather than standing up new storage. source_type stays
 * 'upload' (its CHECK constraint only allows upload|attachment|generated);
 * provenance.purpose distinguishes shop photos. Tenant-wide visibility
 * depends on supabase/migrations/20260821010000_shop_profile_photos_tenant_read.sql —
 * until that's applied, each user still sees/manages their own uploads via
 * the pre-existing owner_id RLS policy, so this endpoint works either way.
 */
function safeName(name: string) {
  return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-").slice(0, 120) || "photo";
}

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requireTenantReadPermission(ctx, "brand_brain:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .select("id,original_name,mime_type,size_bytes,storage_bucket,storage_path,created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "READY")
    .eq("source_type", "upload")
    .contains("provenance", { purpose: SHOP_PROFILE_PURPOSE })
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) return Response.json({ error: "Shop photos could not be loaded" }, { status: 500 });

  const photos = await Promise.all((data ?? []).map(async (asset) => {
    const { data: signed } = await ctx.supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 10 * 60);
    return { id: asset.id, name: asset.original_name, url: signed?.signedUrl ?? null };
  }));
  return Response.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: unknown;
    action?: unknown;
    assetId?: unknown;
    name?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
  if (typeof body.tenantId !== "string") return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "brand_brain:edit");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  try {
    if (body.action === "prepare") {
      if (typeof body.name !== "string" || typeof body.mimeType !== "string" || typeof body.sizeBytes !== "number") {
        throw new Error("File name, type, and size are required");
      }
      const validation = validateMediaMetadata({ name: body.name, mimeType: body.mimeType, sizeBytes: body.sizeBytes });
      if (validation || !SHOP_PROFILE_MIME_TYPES.has(body.mimeType) || body.sizeBytes > 10 * 1024 * 1024) {
        throw new Error(validation ?? "Shop photos must be PNG, JPEG, or WebP images no larger than 10 MB.");
      }
      const assetId = crypto.randomUUID();
      const path = `${ctx.userId}/${ctx.tenantId}/shop-profile-photos/${assetId}-${safeName(body.name)}`;
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
        provenance: { purpose: SHOP_PROFILE_PURPOSE },
      }).select("*").single();
      if (error || !asset) throw new Error("Photo upload could not be prepared");
      const { data: signed, error: signedError } = await ctx.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (signedError || !signed) {
        await ctx.supabase.from("social_media_assets").delete().eq("id", assetId);
        throw new Error("Private upload could not be prepared");
      }
      return Response.json({ assetId, path, token: signed.token, signedUrl: signed.signedUrl }, { status: 201 });
    }

    if (body.action === "finalize") {
      if (typeof body.assetId !== "string") throw new Error("assetId is required");
      const { data: asset } = await ctx.supabase
        .from("social_media_assets")
        .select("*")
        .eq("id", body.assetId)
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "UPLOADING")
        .maybeSingle();
      if (!asset) throw new Error("Pending photo upload was not found");
      const parts = String(asset.storage_path).split("/");
      const objectName = parts.pop();
      const { data: objects, error: listError } = await ctx.supabase.storage.from(BUCKET).list(parts.join("/"), { search: objectName, limit: 2 });
      const object = objects?.find((item) => item.name === objectName);
      const metadata = object?.metadata as { size?: number; mimetype?: string } | undefined;
      if (listError || !object || Number(metadata?.size) !== Number(asset.size_bytes) || String(metadata?.mimetype) !== asset.mime_type) {
        await ctx.supabase.storage.from(BUCKET).remove([asset.storage_path]);
        await ctx.supabase.from("social_media_assets").update({ status: "FAILED" }).eq("id", asset.id);
        throw new Error("Uploaded photo did not match its declared metadata");
      }
      const { data: updated, error } = await ctx.supabase
        .from("social_media_assets")
        .update({ status: "READY", updated_at: new Date().toISOString() })
        .eq("id", asset.id)
        .select("id, original_name")
        .single();
      if (error || !updated) throw new Error("Photo upload could not be finalized");
      return Response.json({ photo: updated });
    }

    throw new Error("Unknown photo action");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Photo upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  const assetId = url.searchParams.get("assetId");
  if (!tenantId || !assetId) return Response.json({ error: "tenantId and assetId are required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "brand_brain:edit");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { data: asset } = await ctx.supabase
    .from("social_media_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!asset) return Response.json({ error: "Photo not found" }, { status: 404 });

  await ctx.supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
  const { error } = await ctx.supabase.from("social_media_assets").delete().eq("id", assetId);
  if (error) return Response.json({ error: "Photo could not be removed" }, { status: 500 });
  return Response.json({ success: true });
}
