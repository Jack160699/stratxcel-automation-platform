import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { revokeOwnWhatsAppPrincipal } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PHASE 18: revoke the authenticated staff caller's OWN WhatsApp agent
 *  link. Scoped strictly to the caller (revokeOwnWhatsAppPrincipal takes
 *  only an authUserId) — this route cannot revoke anyone else's link. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
  if (!body?.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const revoked = await revokeOwnWhatsAppPrincipal(supabase, ctx.userId);
  return Response.json({ revoked }, { headers: { "Cache-Control": "no-store" } });
}
