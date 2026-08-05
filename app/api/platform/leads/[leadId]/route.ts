import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { updateLeadStatus, type LeadStatus } from "@stratxcel/leads-and-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

/**
 * PATCH updates a lead's status. crm_leads has no INSERT/UPDATE RLS policy
 * for authenticated users (only crm_leads_tenant_read — see
 * supabase/migrations/20260803122000_integration_shadow_tables.sql), so the
 * write goes through the service client, same owner/service split every
 * other tenant-scoped write in this build uses. The lead's tenant_id is
 * re-verified against the caller's own tenant membership (via a
 * session-client read) before the service-client write runs, so a
 * service-role write can never be pointed at a different tenant's lead.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const body = (await request.json()) as { tenantId?: string; status?: string };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (!body.status || !VALID_STATUSES.includes(body.status as LeadStatus)) {
    return Response.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data: existing, error: fetchError } = await ctx.supabase
    .from("crm_leads")
    .select("id")
    .eq("id", leadId)
    .eq("tenant_id", body.tenantId)
    .maybeSingle();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return Response.json({ error: "Lead not found in this workspace" }, { status: 404 });

  const { supabase } = getTenantServiceContext();
  const lead = await updateLeadStatus(supabase, { leadId, status: body.status as LeadStatus });
  return Response.json({ lead });
}
