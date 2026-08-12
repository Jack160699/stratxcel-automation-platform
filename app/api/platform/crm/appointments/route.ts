import { requireTenantContext, requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listAppointmentsForTenant, requestAppointment } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const appointments = await listAppointmentsForTenant(ctx.supabase, tenantId);
  return Response.json({ appointments }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Persisted Stratxcel-internal scheduling state only — no external calendar
 * integration exists in this repository, so this never claims a real
 * calendar invite was sent.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, leadId, requestedFor, notes } = body as { tenantId?: string; leadId?: string; requestedFor?: string; notes?: string };
  if (!tenantId || !leadId) return Response.json({ error: "tenantId and leadId are required" }, { status: 400 });

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

  const appointment = await requestAppointment(supabase, { tenantId, leadId, requestedFor: requestedFor ? new Date(requestedFor) : null, notes });
  return Response.json({ appointment }, { status: 201 });
}
