import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, auditOrderId } = body;

    if (!tenantId || !auditOrderId) {
      return Response.json({ error: "tenantId and auditOrderId are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "human_handoff:resolve");
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        return Response.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }

    const { supabase: serviceDb } = getTenantServiceContext();

    // Verify audit order belongs to tenant
    const { data: auditOrder, error: auditErr } = await serviceDb
      .from("audit_orders")
      .select("*")
      .eq("id", auditOrderId)
      .eq("tenant_id", tenantId)
      .single();

    if (auditErr || !auditOrder) {
      return Response.json({ error: "Audit order not found or does not belong to tenant" }, { status: 404 });
    }

    // Call complete_audit_and_issue_subscription_credit via service_role
    const { data: rpcRes, error: rpcErr } = await serviceDb.rpc("complete_audit_and_issue_subscription_credit", {
      p_audit_order_id: auditOrderId,
      p_admin_user_id: ctx.userId,
    });

    if (rpcErr) {
      return Response.json({ error: `Failed to complete audit: ${rpcErr.message}` }, { status: 500 });
    }

    if (!rpcRes || (rpcRes as any).success !== true) {
      return Response.json({ error: `Audit completion rejected: ${(rpcRes as any)?.reason}` }, { status: 400 });
    }

    return Response.json({
      success: true,
      auditOrderId,
      tenantId,
      actingAdminUserId: ctx.userId,
      completedAt: new Date().toISOString(),
      creditExpiresAt: (rpcRes as any).credit_expires_at,
      creditAmountCents: (rpcRes as any).credit_amount_cents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete audit order";
    return Response.json({ error: msg }, { status: 500 });
  }
}
