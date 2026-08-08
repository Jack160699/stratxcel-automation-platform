import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { updateLeadStatus, updateLead, type LeadStatus } from "@stratxcel/leads-and-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

/**
 * PATCH updates a lead's status and/or CRM enrichment fields (tags,
 * assigned owner, notes, next follow-up). crm_leads has no INSERT/UPDATE
 * RLS policy for authenticated users (only crm_leads_tenant_read — see
 * supabase/migrations/20260803122000_integration_shadow_tables.sql), so the
 * write goes through the service client, same owner/service split every
 * other tenant-scoped write in this build uses. The lead's tenant_id is
 * re-verified against the caller's own tenant membership (via a
 * session-client read) before the service-client write runs, so a
 * service-role write can never be pointed at a different tenant's lead.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const body = (await request.json()) as {
    tenantId?: string;
    status?: string;
    tags?: string[];
    assignedTo?: string | null;
    notes?: string | null;
    nextFollowUpAt?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
  };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as LeadStatus)) {
    return Response.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  // Only "assign to me" or "unassign" — never an arbitrary UUID from the
  // client, which would otherwise let any tenant member assign a lead to a
  // user who isn't even a member of this tenant.
  if (body.assignedTo !== undefined && body.assignedTo !== null && body.assignedTo !== "self") {
    return Response.json({ error: "assignedTo must be 'self' or null" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const resolvedAssignedTo = body.assignedTo === "self" ? ctx.userId : body.assignedTo;

  const { data: existing, error: fetchError } = await ctx.supabase
    .from("crm_leads")
    .select("id")
    .eq("id", leadId)
    .eq("tenant_id", body.tenantId)
    .maybeSingle();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return Response.json({ error: "Lead not found in this workspace" }, { status: 404 });

  const { supabase } = getTenantServiceContext();

  if (body.status !== undefined) {
    await updateLeadStatus(supabase, { leadId, status: body.status as LeadStatus });
  }

  const hasEnrichmentUpdate =
    body.tags !== undefined || body.assignedTo !== undefined || body.notes !== undefined || body.nextFollowUpAt !== undefined || body.contactName !== undefined || body.contactEmail !== undefined;

  const lead = hasEnrichmentUpdate
    ? await updateLead(supabase, {
        leadId,
        tenantId: body.tenantId,
        tags: body.tags,
        assignedTo: resolvedAssignedTo,
        notes: body.notes,
        nextFollowUpAt: body.nextFollowUpAt,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
      })
    : (await supabase.from("crm_leads").select("*").eq("id", leadId).single()).data;

  return Response.json({ lead });
}
