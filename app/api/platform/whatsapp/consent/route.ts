import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { recordOptIn, recordOptOut } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff-recorded consent only — never invented. `source` is mandatory and
 * free-text (e.g. "customer replied YES to WhatsApp opt-in prompt on
 * 2026-08-08", "verbal consent at in-person intake") so there's always a
 * human-readable trail for why a contact is marked opted-in.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, leadId, action, source, reason, evidence } = body as {
    tenantId?: string;
    leadId?: string;
    action?: "opt_in" | "opt_out";
    source?: string;
    reason?: string;
    evidence?: string;
  };

  if (!tenantId || !leadId || !action) return Response.json({ error: "tenantId, leadId, and action (opt_in | opt_out) are required" }, { status: 400 });
  if (action === "opt_in" && !source) return Response.json({ error: "source is required to record an opt-in" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "crm:manage");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const { data: lead } = await supabase.from("crm_leads").select("id").eq("id", leadId).eq("tenant_id", tenantId).maybeSingle();
  if (!lead) return Response.json({ error: "Lead not found in this workspace" }, { status: 404 });

  const consent = action === "opt_in" ? await recordOptIn(supabase, { tenantId, leadId, source: source!, evidence }) : await recordOptOut(supabase, { tenantId, leadId, reason });

  return Response.json({ consent });
}
