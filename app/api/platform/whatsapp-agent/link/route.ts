import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { revokeOwnWhatsAppPrincipal } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PHASE 18: revoke the authenticated client caller's OWN WhatsApp agent
 *  link. Scoped strictly to the caller. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
  if (!body?.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const revoked = await revokeOwnWhatsAppPrincipal(supabase, ctx.userId);
  return Response.json({ revoked }, { headers: { "Cache-Control": "no-store" } });
}
