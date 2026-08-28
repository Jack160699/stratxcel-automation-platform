import crypto from "node:crypto";
import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { analyzeLogo, type LogoAnalysisResult } from "@/lib/brand/logo-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // real sharp processing on a small logo image is fast (sub-second); generous margin over cold-start + 4 storage uploads

const BUCKET = "social-agent-attachments"; // same bucket app/api/platform/brand/photos/route.ts already uses for tenant-owned brand media
const LOGO_ANALYSIS_PURPOSE = "logo_variant";

type VariantKind = "transparent" | "monoLight" | "monoDark" | "badge";
const VARIANT_KINDS: VariantKind[] = ["transparent", "monoLight", "monoDark", "badge"];
// Display convenience only -- the durable reference the compositor
// actually resolves at generation time is each variant's assetId
// (persisted into brand_brains content), never this URL, since the
// bucket is private and any signed URL will eventually expire. A
// generous TTL just keeps the immediately-following Selector UI (Phase
// 4) working without a second round trip.
const DISPLAY_URL_TTL_SECONDS = 60 * 60 * 24 * 180; // ~6 months

/**
 * BrandBrain Logo Engine Phase 3: takes an already-uploaded raw logo
 * asset (via the same prepare/finalize protocol
 * app/api/platform/brand/photos/route.ts uses -- this route never
 * accepts raw file bytes itself, only a reference to an asset already in
 * social_media_assets) and runs the real sharp pipeline
 * (lib/brand/logo-analyzer.ts) to produce and persist all 4 variants.
 * Each variant is its own social_media_assets row (source_type:
 * "generated", provenance.purpose: "logo_variant") -- no new table, per
 * the approved "route through social_media_assets" design.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: unknown; sourceAssetId?: unknown };
  if (typeof body.tenantId !== "string") return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (typeof body.sourceAssetId !== "string") return Response.json({ error: "sourceAssetId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "brand_brain:edit");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { data: source } = await ctx.supabase
    .from("social_media_assets")
    .select("id, storage_bucket, storage_path, mime_type, status")
    .eq("id", body.sourceAssetId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!source) return Response.json({ error: "Source logo upload not found" }, { status: 404 });
  if (source.status !== "READY") return Response.json({ error: "The uploaded logo hasn't finished uploading yet" }, { status: 409 });
  if (!["image/png", "image/jpeg", "image/webp"].includes(source.mime_type)) {
    return Response.json({ error: "Logos must be PNG, JPEG, or WebP images" }, { status: 400 });
  }

  const { data: sourceBytes, error: downloadError } = await ctx.supabase.storage.from(source.storage_bucket).download(source.storage_path);
  if (downloadError || !sourceBytes) return Response.json({ error: "Could not read the uploaded logo" }, { status: 500 });

  let analysis: LogoAnalysisResult;
  try {
    analysis = await analyzeLogo(Buffer.from(await sourceBytes.arrayBuffer()));
  } catch {
    return Response.json({ error: "Could not analyze this logo. Try a different image, or upload a pre-cleaned transparent PNG." }, { status: 422 });
  }

  // Extracted to a local so TS's control-flow narrowing of `ctx.ok`
  // (checked above) isn't lost inside the hoisted `rollback` function
  // declaration below.
  const supabase = ctx.supabase;
  const variants: Partial<Record<VariantKind, { assetId: string; url: string | null }>> = {};
  // Tracks every storage object + DB row actually created this call, so a
  // failure partway through can be rolled back cleanly instead of leaving
  // an inconsistent, partially-created variant set behind.
  const created: Array<{ assetId: string; path: string }> = [];

  async function rollback(reason: string) {
    for (const item of created) {
      try {
        await supabase.storage.from(BUCKET).remove([item.path]);
        await supabase.from("social_media_assets").delete().eq("id", item.assetId);
      } catch {
        // best-effort cleanup -- the client still gets the real error below either way
      }
    }
    return Response.json({ error: reason }, { status: 500 });
  }

  // badge is always its own fixed square (lib/brand/logo-analyzer.ts's
  // BADGE_SIZE); the other three share the analyzed source's own
  // dimensions. Stored in provenance (social_media_assets has no
  // width/height columns of its own) so the real production compositor
  // caller (lib/image-generation/service.ts) can compute aspect ratio
  // without re-decoding the image bytes just to get its size.
  const VARIANT_DIMENSIONS: Record<VariantKind, { width: number; height: number }> = {
    transparent: { width: analysis.width, height: analysis.height },
    monoLight: { width: analysis.width, height: analysis.height },
    monoDark: { width: analysis.width, height: analysis.height },
    badge: { width: 512, height: 512 },
  };

  for (const kind of VARIANT_KINDS) {
    const assetId = crypto.randomUUID();
    const path = `${ctx.userId}/${ctx.tenantId}/logo-variants/${assetId}-${kind}.png`;
    const buffer = analysis[kind];
    const { error: uploadError } = await ctx.supabase.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: false });
    if (uploadError) return rollback("Could not save the generated logo variants");

    const { data: assetRow, error: insertError } = await ctx.supabase
      .from("social_media_assets")
      .insert({
        id: assetId,
        owner_id: ctx.userId,
        tenant_id: ctx.tenantId,
        storage_bucket: BUCKET,
        storage_path: path,
        original_name: `logo-${kind}.png`,
        extension: "png",
        mime_type: "image/png",
        size_bytes: buffer.length,
        status: "READY",
        source_type: "generated",
        provenance: { purpose: LOGO_ANALYSIS_PURPOSE, variant: kind, sourceAssetId: source.id, ...VARIANT_DIMENSIONS[kind] },
      })
      .select("id")
      .single();
    if (insertError || !assetRow) {
      await ctx.supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
      return rollback("Could not save the generated logo variants");
    }
    created.push({ assetId, path });

    const { data: signed } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(path, DISPLAY_URL_TTL_SECONDS);
    variants[kind] = { assetId, url: signed?.signedUrl ?? null };
  }

  return Response.json({ variants, backgroundRemoved: analysis.backgroundRemoved, width: analysis.width, height: analysis.height });
}
