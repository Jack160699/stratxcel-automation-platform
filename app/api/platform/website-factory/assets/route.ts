import crypto from "node:crypto";
import { requireTenantContext, requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { extensionForName, validateMediaMetadata } from "@/lib/social/media-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logo / image uploads for the "Create Your Website" workspace (Step 3).
 * Mirrors app/api/platform/brand/photos/route.ts's prepare/finalize pattern
 * against the same pre-existing social_media_assets table/bucket rather
 * than standing up new storage — only the provenance.purpose differs, so
 * these never show up mixed in with Brand's shop-photo gallery.
 */
const BUCKET = "social-agent-attachments";
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 10 * 1024 * 1024;
const WEBSITE_ASSET_PURPOSES = new Set(["website_logo", "website_image"]);

function safeName(name: string) {
  return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-").slice(0, 120) || "image";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.supabase
    .from("social_media_assets")
    .select("id,original_name,mime_type,storage_bucket,storage_path,provenance,created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "READY")
    .eq("source_type", "upload")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: "Website images could not be loaded" }, { status: 500 });

  const websiteRows = (data ?? []).filter((asset) =>
    WEBSITE_ASSET_PURPOSES.has((asset.provenance as { purpose?: string } | null)?.purpose ?? "")
  ).slice(0, 20);

  const images = await Promise.all(
    websiteRows.map(async (asset) => {
      const { data: signed } = await ctx.supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60);
      return {
        id: asset.id,
        name: asset.original_name,
        purpose: (asset.provenance as { purpose?: string } | null)?.purpose ?? "website_image",
        url: signed?.signedUrl ?? null,
      };
    })
  );
  return Response.json({ images }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: unknown;
    action?: unknown;
    assetId?: unknown;
    name?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    purpose?: unknown;
  };
  if (typeof body.tenantId !== "string") return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    if (body.action === "prepare") {
      const purpose = typeof body.purpose === "string" && WEBSITE_ASSET_PURPOSES.has(body.purpose) ? body.purpose : "website_image";
      if (typeof body.name !== "string" || typeof body.mimeType !== "string" || typeof body.sizeBytes !== "number") {
        throw new Error("File name, type, and size are required");
      }
      const validation = validateMediaMetadata({ name: body.name, mimeType: body.mimeType, sizeBytes: body.sizeBytes });
      if (validation || !ALLOWED_MIME_TYPES.has(body.mimeType) || body.sizeBytes > MAX_BYTES) {
        throw new Error(validation ?? "Images must be PNG, JPEG, WebP, or SVG, no larger than 10 MB.");
      }
      const assetId = crypto.randomUUID();
      const path = `${ctx.userId}/${ctx.tenantId}/website-assets/${assetId}-${safeName(body.name)}`;
      const { data: asset, error } = await ctx.supabase
        .from("social_media_assets")
        .insert({
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
          provenance: { purpose },
        })
        .select("*")
        .single();
      if (error || !asset) throw new Error("Image upload could not be prepared");
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
      if (!asset) throw new Error("Pending image upload was not found");
      const parts = String(asset.storage_path).split("/");
      const objectName = parts.pop();
      const { data: objects, error: listError } = await ctx.supabase.storage.from(BUCKET).list(parts.join("/"), { search: objectName, limit: 2 });
      const object = objects?.find((item) => item.name === objectName);
      const metadata = object?.metadata as { size?: number; mimetype?: string } | undefined;
      if (listError || !object || Number(metadata?.size) !== Number(asset.size_bytes) || String(metadata?.mimetype) !== asset.mime_type) {
        await ctx.supabase.storage.from(BUCKET).remove([asset.storage_path]);
        await ctx.supabase.from("social_media_assets").update({ status: "FAILED" }).eq("id", asset.id);
        throw new Error("Uploaded image did not match its declared metadata");
      }
      const { data: updated, error } = await ctx.supabase
        .from("social_media_assets")
        .update({ status: "READY", updated_at: new Date().toISOString() })
        .eq("id", asset.id)
        .select("id, original_name, storage_bucket, storage_path")
        .single();
      if (error || !updated) throw new Error("Image upload could not be finalized");
      const { data: signed } = await ctx.supabase.storage.from(updated.storage_bucket).createSignedUrl(updated.storage_path, 60 * 60);
      return Response.json({ image: { id: updated.id, name: updated.original_name, url: signed?.signedUrl ?? null } });
    }

    throw new Error("Unknown image action");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Image upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  const assetId = url.searchParams.get("assetId");
  if (!tenantId || !assetId) return Response.json({ error: "tenantId and assetId are required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data: asset } = await ctx.supabase
    .from("social_media_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!asset) return Response.json({ error: "Image not found" }, { status: 404 });

  await ctx.supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
  const { error } = await ctx.supabase.from("social_media_assets").delete().eq("id", assetId);
  if (error) return Response.json({ error: "Image could not be removed" }, { status: 500 });
  return Response.json({ success: true });
}
