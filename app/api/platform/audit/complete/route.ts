import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";

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

    // Enforce True Platform Staff Authorization (Customer tenant owners/admins are 403 Forbidden!)
    const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin", "audit_reviewer"]);
    if (!staffAuth.ok) {
      return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
    }

    const { supabase: serviceDb } = getTenantServiceContext();

    // Call complete_audit_and_issue_subscription_credit_v5 via service_role
    const { data: rpcRes, error: rpcErr } = await serviceDb.rpc("complete_audit_and_issue_subscription_credit_v5", {
      p_audit_order_id: auditOrderId,
      p_expected_tenant_id: tenantId,
      p_actor_user_id: ctx.userId,
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
