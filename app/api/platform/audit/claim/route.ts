import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAIMABLE_STATUSES = ["paid", "in_review", "completed"];

/**
 * Attaches a guest-purchased ₹999 Audit to the caller's authenticated
 * account — the one step that turns a payment into access.
 *
 * The "cryptographically strong opaque claim mechanism" here is Supabase's
 * own signInWithOtp: the caller only has a session for this exact email
 * because they clicked the single-use, time-limited magic link Supabase
 * emailed to it. Nothing invented is layered on top — reusing that is
 * simpler and no less safe than hand-rolling a second bearer token, and it
 * doubles as account creation for a brand-new customer.
 *
 * Every other safety property is enforced here, server-side, against the
 * database the webhook actually wrote:
 *  - order.status must be paid/in_review/completed — a pending_payment or
 *    refunded/cancelled order grants nothing, no matter who asks.
 *  - order.guest_email must match the caller's own verified email — a
 *    purchase can only be claimed by the person who received the OTP.
 *  - claimed_at is set exactly once; a second claim by the same user is a
 *    no-op success (idempotent), a claim by a different user is rejected.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { auditOrderId?: string };
  if (!body.auditOrderId) return Response.json({ error: "auditOrderId is required" }, { status: 400 });

  const { supabase: service } = getTenantServiceContext();
  const { data: order, error: orderError } = await service
    .from("audit_orders")
    .select("id, tenant_id, status, guest_email, claimed_at")
    .eq("id", body.auditOrderId)
    .maybeSingle();

  if (orderError || !order) return Response.json({ error: "Audit purchase not found" }, { status: 404 });

  if (!CLAIMABLE_STATUSES.includes(order.status)) {
    return Response.json({ error: "This purchase has not been paid for yet." }, { status: 402 });
  }

  const verifiedEmail = user.email.trim().toLowerCase();
  if (!order.guest_email || order.guest_email.trim().toLowerCase() !== verifiedEmail) {
    return Response.json({ error: "This purchase is registered to a different email address." }, { status: 403 });
  }

  // Idempotent: already claimed by this same account is a success, not an error.
  const { data: existingMembership } = await service
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", order.tenant_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return Response.json({ ok: true, tenantId: order.tenant_id }, { headers: { "Cache-Control": "no-store" } });
  }

  if (order.claimed_at) {
    return Response.json({ error: "This purchase has already been claimed." }, { status: 409 });
  }

  const { error: memberError } = await service.from("tenant_members").insert({
    tenant_id: order.tenant_id,
    user_id: user.id,
    role: "owner",
  });
  if (memberError) {
    console.error("audit claim: failed to attach membership", memberError.message);
    return Response.json({ error: "Could not claim this purchase. Please try again." }, { status: 500 });
  }

  await service.from("audit_orders").update({ claimed_at: new Date().toISOString() }).eq("id", order.id);

  return Response.json({ ok: true, tenantId: order.tenant_id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
