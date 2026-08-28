import { NextResponse, type NextRequest } from "next/server";
import { requireClientContext } from "@/lib/tenants/client-context";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Content Library Cleanup mission Task C: a real delete for the three
 * distinct real tables the Content Library actually reads from
 * (image_generation_jobs, content_variants, social_media_assets) --
 * never a single generic "content" table, since none exists. `kind`
 * (from ContentItem.deleteKind) tells this route which real table+
 * ownership check applies; every path re-verifies tenant ownership itself
 * via the service client rather than trusting RLS alone, matching this
 * session's established defense-in-depth pattern.
 */
const VALID_KINDS = new Set(["image_generation_job", "content_variant", "social_media_asset"]);

async function authorizeTenant(tenantId: string) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return { ok: false as const, status: 401 as const, error: ctx.error };
  if (ctx.accessMode === "staff_support") return { ok: false as const, status: 403 as const, error: "Staff support mode is read-only" };
  const isMember = await isMemberOfTenant(ctx.supabase, ctx.userId, tenantId);
  if (!isMember) return { ok: false as const, status: 403 as const, error: "Not a member of this client" };
  return { ok: true as const, userId: ctx.userId };
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const kind = request.nextUrl.searchParams.get("kind");
  if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  if (!kind || !VALID_KINDS.has(kind)) return NextResponse.json({ error: "A valid content kind is required" }, { status: 400 });
  const auth = await authorizeTenant(tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const service = createSupabaseServiceClient();

  if (kind === "image_generation_job") {
    // image_generation_candidates has `on delete cascade` on job_id
    // (20260812104243_image_generation_v1.sql) -- deleting the job row is
    // enough. Underlying social_media_assets are left alone deliberately:
    // a selected candidate's asset may be referenced elsewhere (a
    // published post's media), so this only removes the generation
    // record itself, never cascades into shared storage.
    const { data: job } = await service.from("image_generation_jobs").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!job) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    const { error } = await service.from("image_generation_jobs").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ error: "Could not delete this creative." }, { status: 500 });
  } else if (kind === "content_variant") {
    // content_variants has no tenant_id column of its own -- ownership is
    // only provable through its parent content_master row.
    const { data: variant } = await service.from("content_variants").select("id, master_id").eq("id", id).maybeSingle();
    if (!variant) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const { data: master } = await service.from("content_master").select("tenant_id").eq("id", variant.master_id).maybeSingle();
    if (!master || master.tenant_id !== tenantId) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const { error } = await service.from("content_variants").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Could not delete this draft." }, { status: 500 });
  } else {
    // social_media_asset -- a real uploaded/saved asset; unlike a
    // generation's underlying asset, this IS the thing being deleted, so
    // storage is removed too (same pattern as
    // app/api/platform/brand/photos/route.ts's DELETE).
    const { data: asset } = await service.from("social_media_assets").select("storage_bucket, storage_path").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    await service.storage.from(asset.storage_bucket).remove([asset.storage_path]).catch(() => undefined);
    const { error } = await service.from("social_media_assets").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ error: "Could not delete this asset." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
