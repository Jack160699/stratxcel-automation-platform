import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { normalizeAuditDeliveryReport } from "@/lib/audit/customer-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, auditOrderId, reportData } = body;

    if (!tenantId || !auditOrderId) {
      return Response.json({ error: "tenantId and auditOrderId are required" }, { status: 400 });
    }

    const report = normalizeAuditDeliveryReport(reportData);
    if (!report) {
      return Response.json(
        { error: "A complete report with an executive summary, priority risks, and 90-day plan is required" },
        { status: 422 },
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    // Enforce True Platform Staff Authorization (Customer tenant owners/admins are 403 Forbidden!)
    const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin", "audit_reviewer"]);
    if (!staffAuth.ok) {
      return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
    }

    const { supabase: serviceDb } = getTenantServiceContext();

    const { data: order, error: orderError } = await serviceDb
      .from("audit_orders")
      .select("id, tenant_id, status")
      .eq("id", auditOrderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (orderError) return Response.json({ error: "Could not verify the audit order" }, { status: 500 });
    if (!order) return Response.json({ error: "Audit order not found for this workspace" }, { status: 404 });
    if (order.status !== "in_review") {
      return Response.json({ error: `Audit cannot be delivered from status '${order.status}'` }, { status: 409 });
    }

    const { data: savedReport, error: reportError } = await serviceDb
      .from("audit_orders")
      .update({ report_data: report, updated_at: new Date().toISOString() })
      .eq("id", auditOrderId)
      .eq("tenant_id", tenantId)
      .eq("status", "in_review")
      .select("id")
      .maybeSingle();
    if (reportError) return Response.json({ error: "Could not save the audit report" }, { status: 500 });
    if (!savedReport) return Response.json({ error: "Audit state changed before the report could be saved" }, { status: 409 });

    // Call complete_audit_and_issue_subscription_credit_v5 via service_role
    const { data: rpcRes, error: rpcErr } = await serviceDb.rpc("complete_audit_and_issue_subscription_credit_v5", {
      p_audit_order_id: auditOrderId,
      p_expected_tenant_id: tenantId,
      p_actor_user_id: ctx.userId,
    });

    if (rpcErr) {
      return Response.json({ error: `Failed to complete audit: ${rpcErr.message}` }, { status: 500 });
    }

    const completion = rpcRes as { success?: boolean; reason?: string; credit_expires_at?: string; credit_amount_cents?: number } | null;
    if (!completion || completion.success !== true) {
      return Response.json({ error: `Audit completion rejected: ${completion?.reason ?? "unknown_reason"}` }, { status: 400 });
    }

    return Response.json({
      success: true,
      auditOrderId,
      tenantId,
      actingAdminUserId: ctx.userId,
      completedAt: new Date().toISOString(),
      creditExpiresAt: completion.credit_expires_at,
      creditAmountCents: completion.credit_amount_cents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete audit order";
    return Response.json({ error: msg }, { status: 500 });
  }
}
