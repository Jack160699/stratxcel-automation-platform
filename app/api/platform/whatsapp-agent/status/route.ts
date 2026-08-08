import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getOwnWhatsAppPrincipalStatus } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PHASE 18: status of the authenticated client caller's OWN WhatsApp agent
 *  link. Any tenant member may check their own status (read-only, no
 *  additional permission required beyond membership). */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();
  const status = await getOwnWhatsAppPrincipalStatus(supabase, ctx.userId);
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
