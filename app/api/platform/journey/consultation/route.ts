import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records that a customer asked for a consultation, so the journey panel's
 * final stage reflects something that actually happened rather than a page
 * having been visited.
 *
 * Writes one audit_events row — the same tenant-scoped table onboarding
 * already uses — through the service client, because audit_events has no
 * client insert policy by design. Membership is proven first by
 * requireTenantContext(), so a caller can only ever write against a tenant
 * they belong to.
 *
 * Deliberately stores no message body: the conversation itself belongs in
 * /contact, and this row exists only to answer "has this been asked for?".
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
  if (!body.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();
  const { error } = await supabase.from("audit_events").insert({
    tenant_id: body.tenantId,
    actor_user_id: ctx.userId,
    action: "journey.consultation_requested",
    target_type: "tenant",
    target_id: body.tenantId,
    metadata: {},
  });

  if (error) {
    console.error("journey: failed to record consultation request", error.message);
    return Response.json({ error: "Could not record your request. Please use the contact form." }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
