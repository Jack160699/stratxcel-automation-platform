import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { cancelFollowUp } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only supports cancellation from the UI — attempt recording (sent/skipped/failed) is the worker's own job, not a client-triggered action. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, action } = body as { tenantId?: string; action?: "cancel" };
  if (!tenantId || action !== "cancel") return Response.json({ error: "tenantId and action='cancel' are required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "crm:manage");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  await cancelFollowUp(supabase, tenantId, id);
  return Response.json({ success: true });
}
