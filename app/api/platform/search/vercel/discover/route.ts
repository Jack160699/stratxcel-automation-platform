import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { discoverVercelProjects } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/platform/search/vercel/discover
 * Body: { tenantId }
 *
 * Re-runs real project/domain discovery for an already-connected tenant.
 * Read-only against Vercel (list projects, list domains) -- never
 * deploys, never mutates the customer's Vercel account. Matches the
 * ANALYSIS_ONLY / AUTONOMOUS_WRITE separation this connector maintains --
 * discovery is always available regardless of which scope was granted at
 * connect time.
 */
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
  const result = await discoverVercelProjects(supabase, { tenantId: body.tenantId });
  if (!result.ok) return Response.json({ error: "SEARCH_VERCEL_DISCOVERY_FAILED", reason: result.reason }, { status: 400 });
  return Response.json({ discovered: true, projectCount: result.projectCount }, { status: 200 });
}
