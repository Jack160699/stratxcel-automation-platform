import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { reconcilePaymentLink } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    let tenantId = body.tenantId || body.tenant_id;

    if (!tenantId) {
      const { supabase: serviceDb } = getTenantServiceContext();
      const { data: foundLink } = await serviceDb
        .from("payment_links")
        .select("tenant_id")
        .or(`id.eq.${id},reference_id.eq.${id}`)
        .maybeSingle();

      if (foundLink?.tenant_id) {
        tenantId = foundLink.tenant_id;
      }
    }

    if (!tenantId) {
      return Response.json({ error: "tenantId is required or link not found" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId, request);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "wallet:topup");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    const { supabase } = getTenantServiceContext();
    const result = await reconcilePaymentLink(supabase, { linkId: id, tenantId });

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error && !err.message.includes("database")
      ? err.message
      : "Failed to reconcile payment link";
    return Response.json({ error: msg }, { status: 400 });
  }
}
