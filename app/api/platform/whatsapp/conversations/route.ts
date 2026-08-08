import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { listConversationsForTenant } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Real inbox list — backed by whatsapp_conversations, distinct from the shadow-only proposed-response log. Plain session-client read, covered by RLS. */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const conversations = await listConversationsForTenant(ctx.supabase, tenantId);
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
