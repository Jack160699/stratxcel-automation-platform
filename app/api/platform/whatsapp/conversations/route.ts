import { requireTenantReadContext, requireAdminAggregateReadContext } from "@/lib/tenants/tenant-context";
import { listConversationsForTenant, listConversationsForTenants } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real inbox list — backed by whatsapp_conversations, distinct from the
 * shadow-only proposed-response log. Plain session-client read, covered by
 * RLS for a single tenant; omitting tenantId is the central Admin CRM's
 * aggregate read across every authorized agency client (see
 * requireAdminAggregateReadContext).
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");

  if (!tenantId) {
    const agg = await requireAdminAggregateReadContext();
    if (!agg.ok) return Response.json({ error: agg.error }, { status: agg.status });
    const conversations = await listConversationsForTenants(agg.supabase, agg.tenantIds);
    return Response.json({ conversations, tenants: agg.tenants }, { headers: { "Cache-Control": "no-store" } });
  }

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const conversations = await listConversationsForTenant(ctx.supabase, tenantId);
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
