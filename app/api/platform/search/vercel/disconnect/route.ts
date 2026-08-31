import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { disconnectVercelWebsite } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
  if (!body.tenantId) return Response.json({ error: "SEARCH_VERCEL_INVALID_REQUEST" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const result = await disconnectVercelWebsite(supabase, { tenantId: body.tenantId });
  if (!result.ok) return Response.json({ error: "SEARCH_VERCEL_DISCONNECT_FAILED", reason: result.reason }, { status: 500 });
  return Response.json({ disconnected: true }, { status: 200 });
}
