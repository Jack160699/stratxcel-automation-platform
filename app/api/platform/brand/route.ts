import { requireTenantContext, requireTenantReadContext, requireTenantReadPermission, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { getCurrentBrandBrain, saveBrandBrainVersion, type BrandBrainContent } from "@stratxcel/brand-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First API route for @stratxcel/brand-brain — the package and its
 * versioned tenant-scoped tables (supabase/migrations/20260803120500_brand_brain.sql)
 * already existed with no route consuming them. GET is a plain
 * user-initiated read, covered by brand_brains_tenant_read /
 * brand_brain_versions_tenant_read RLS — runs on the authenticated session
 * client. POST (a new version) goes through the service client, same
 * owner/service split every other tenant-scoped write in this build uses.
 */
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

  const brandBrain = await getCurrentBrandBrain(ctx.supabase, tenantId);
  return Response.json({ brandBrain }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { tenantId?: string; content?: BrandBrainContent };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (!body.content) return Response.json({ error: "content is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "brand_brain:edit");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const version = await saveBrandBrainVersion(supabase, { tenantId: body.tenantId, content: body.content, createdBy: ctx.userId });
  return Response.json({ version }, { status: 201 });
}
