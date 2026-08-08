import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createHumanHandoff } from "@stratxcel/human-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * No registrar configured here supports an automated EPP/auth-code
 * transfer-out API — this records a genuine, secure support-state request
 * (routed to a human handoff for staff to action manually) rather than
 * pretending an automated transfer pipeline exists. An auth/EPP code is
 * never generated, stored, or exposed by this route.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data: domain, error } = await serviceDb.from("domains").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error || !domain) return Response.json({ error: "Domain not found" }, { status: 404 });

  if (domain.status !== "active") {
    return Response.json({ error: `Domain must be active to request transfer-out (current status: ${domain.status})` }, { status: 400 });
  }
  if (domain.transfer_out_status === "requested" || domain.transfer_out_status === "in_progress") {
    return Response.json({ domain, message: "Transfer-out already requested." });
  }

  const { data: updated, error: updateErr } = await serviceDb
    .from("domains")
    .update({ transfer_out_status: "requested", transfer_out_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  await createHumanHandoff(serviceDb, {
    tenantId,
    reason: `Domain transfer-out requested: ${domain.domain_name}`,
    contextSnapshot: { domainId: id, domainName: domain.domain_name, provider: domain.provider },
  });

  return Response.json({ domain: updated });
}
