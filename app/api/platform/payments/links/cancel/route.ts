import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { cancelPaymentLink } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, linkId } = body;

    if (!tenantId || !linkId) {
      return Response.json({ error: "tenantId and linkId are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "wallet:topup");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    const { supabase } = getTenantServiceContext();
    const updated = await cancelPaymentLink(supabase, { linkId, tenantId });

    return Response.json({ link: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to cancel payment link";
    return Response.json({ error: msg }, { status: 400 });
  }
}
