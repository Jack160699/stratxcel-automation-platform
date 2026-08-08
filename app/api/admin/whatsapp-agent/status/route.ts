import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getOwnWhatsAppPrincipalStatus } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PHASE 18: status of the authenticated staff caller's OWN WhatsApp agent
 *  link. Never returns another user's phone number or link status. */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const status = await getOwnWhatsAppPrincipalStatus(supabase, ctx.userId);
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
