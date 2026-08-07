import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancel-at-period-end (default) or un-cancel a subscription the caller owns.
 * Server re-validates tenant ownership both here (requireTenantContext) and inside
 * set_subscription_cancellation — never trusts the tenantId in the body alone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, cancel } = body as { tenantId?: string; cancel?: boolean };

  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "wallet:topup");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data, error } = await serviceDb.rpc("set_subscription_cancellation", {
    p_subscription_id: id,
    p_tenant_id: tenantId,
    p_cancel: cancel !== false,
  });

  if (error) return Response.json({ error: `Failed to update cancellation: ${error.message}` }, { status: 500 });

  const result = data as { success: boolean; reason?: string; access_until?: string };
  if (!result.success) {
    const status = result.reason === "subscription_not_found" ? 404 : result.reason === "tenant_mismatch" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
