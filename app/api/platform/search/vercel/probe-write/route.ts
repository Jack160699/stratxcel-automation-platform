import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { probeVercelWriteCapability } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/search/vercel/probe-write
 * Body: { tenantId }
 *
 * Performs a real, non-destructive write capability probe using the customer's
 * actual vaulted Vercel token. Updates search_website_connections.scope to the
 * truthful value (AUTONOMOUS_WRITE or ANALYSIS_ONLY) based on what Vercel actually
 * returns when we attempt a write with the customer's credential.
 *
 * This is the single source of truth for establishing whether the connected token
 * genuinely supports website mutations. It is separate from connect/discover
 * so it can be triggered on-demand (e.g. when UI shows "Connected · read-only"
 * and customer wants to verify/upgrade their token scope).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };

  if (!body.tenantId) {
    return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();

  const result = await probeVercelWriteCapability(supabase, {
    tenantId: body.tenantId,
  });

  const statusCode = result.capabilityState === "NOT_CONNECTED" ? 404
    : result.capabilityState === "AUTH_FAILED" ? 401
    : result.capabilityState === "ERROR" ? 500
    : 200;

  return Response.json({
    capabilityState: result.capabilityState,
    persistedScope: result.persistedScope,
    writeReady: result.capabilityState === "WRITE_READY",
    reason: result.reason,
    probeHttpStatus: result.probeHttpStatus,
  }, { status: statusCode });
}
