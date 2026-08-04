import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { requestRefund } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, paymentOrderId, amountCents, reason } = body;

    if (!tenantId || !paymentOrderId || !amountCents) {
      return Response.json({ error: "tenantId, paymentOrderId and amountCents are required" }, { status: 400 });
    }

    const numCents = Number(amountCents);
    if (isNaN(numCents) || numCents <= 0 || !Number.isInteger(numCents)) {
      return Response.json({ error: "amountCents must be a positive integer in paise" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "wallet:spend");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    const { supabase } = getTenantServiceContext();

    // Verify payment order belongs to tenant and is in CAPTURED state
    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", paymentOrderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (orderErr || !order) {
      return Response.json({ error: "Payment order not found or not owned by tenant" }, { status: 404 });
    }

    if (order.state !== "CAPTURED" && order.state !== "PARTIALLY_REFUNDED") {
      return Response.json({ error: `Cannot refund payment order in state '${order.state}'` }, { status: 400 });
    }

    if (numCents > order.amount_cents) {
      return Response.json({ error: "Refund amount cannot exceed original payment amount" }, { status: 400 });
    }

    const refund = await requestRefund(supabase, {
      tenantId,
      paymentOrderId,
      amountCents: numCents,
      reason: reason || undefined,
      requestedBy: ctx.userId,
    });

    return Response.json({ refund }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process refund request";
    return Response.json({ error: msg }, { status: 400 });
  }
}
