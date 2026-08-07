import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { createPaymentLink, isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIT_FEE_CENTS = 99900; // ₹999.00, GST-inclusive — never derived from client input.

/**
 * Starts the payment-first ₹999 Audit: get-or-create the customer's tenant,
 * get-or-create a `pending_payment` audit_orders row for it, and create a
 * Razorpay Payment Link scoped to purpose "audit_fee" for exactly that row.
 *
 * The only thing this route ever charges is AUDIT_FEE_CENTS — no amount is
 * ever read from the request body. PAYMENTS_AUDIT_ENABLED is the single gate;
 * every other payment surface (subscriptions, wallet top-ups, domains,
 * continuation packs) is untouched and stays off regardless of this flag.
 *
 * Idempotent by design: a customer who reloads or comes back later gets the
 * same pending order and the same (or a freshly regenerated, if expired)
 * payment link — never a second ₹999 order for the same tenant while one is
 * still payable.
 */
export async function POST() {
  if (!isPaymentFeatureEnabled("PAYMENTS_AUDIT_ENABLED")) {
    return Response.json(
      { error: "Audit checkout is being activated. Please check back shortly, or request a consultation." },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { supabase: service } = getTenantServiceContext();

  // Reuse the customer's existing tenant, or create the smallest possible one
  // silently — a name and a random slug, nothing else. This is identity, not
  // onboarding: no business details, no Brand Brain, no goals are asked here.
  const memberships = await listMembershipsForUser(supabase, user.id);
  let tenantId: string;
  if (memberships.length > 0) {
    tenantId = memberships[0].tenant.id;
  } else {
    const slug = `audit-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const tenant = await createTenant(service, { slug, name: "My Business", ownerUserId: user.id });
    tenantId = tenant.id;
  }

  // Reuse a still-payable order for this tenant if one exists.
  const { data: existing } = await service
    .from("audit_orders")
    .select("id, payment_link_id")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let auditOrderId: string;
  if (existing) {
    auditOrderId = existing.id;
  } else {
    const { data: created, error } = await service
      .from("audit_orders")
      .insert({
        tenant_id: tenantId,
        business_name: "Pending — completed in intake",
        audit_fee_cents: AUDIT_FEE_CENTS,
        status: "pending_payment",
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("audit checkout: failed to create audit_orders row", error?.message);
      return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
    }
    auditOrderId = created.id;
  }

  // A still-valid payment link already exists for this order — reuse it
  // rather than creating a second Razorpay Payment Link for the same order.
  if (existing?.payment_link_id) {
    const { data: link } = await service
      .from("payment_links")
      .select("short_url, status")
      .eq("id", existing.payment_link_id)
      .maybeSingle();
    if (link?.short_url && link.status === "created") {
      return Response.json({ paymentUrl: link.short_url, auditOrderId }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  try {
    const link = await createPaymentLink(service, {
      tenantId,
      amountCents: AUDIT_FEE_CENTS,
      currency: "INR",
      description: "Stratxcel AI Business Growth Audit",
      referenceId: auditOrderId,
      customerEmail: user.email ?? undefined,
      paymentPurpose: "audit_fee",
      createdBy: user.id,
    });

    await service.from("audit_orders").update({ payment_link_id: link.id, updated_at: new Date().toISOString() }).eq("id", auditOrderId);

    if (!link.short_url) {
      return Response.json({ error: "Payment link created without a checkout URL. Please try again." }, { status: 500 });
    }

    return Response.json({ paymentUrl: link.short_url, auditOrderId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    console.error("audit checkout: payment link creation failed", message);
    return Response.json({ error: "Could not start checkout. Please try again or request a consultation." }, { status: 502 });
  }
}

/**
 * Current Audit state for this customer's tenant — what the /app/audit hub
 * and the journey panel render from. Never fabricates a status; a tenant
 * with no audit_orders row returns `null`.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return Response.json({ order: null }, { headers: { "Cache-Control": "no-store" } });

  const tenantId = memberships[0].tenant.id;
  const { data: order } = await supabase
    .from("audit_orders")
    .select(
      "id, status, business_name, industry, website_url, social_links, goals, deep_dive_answers, goals_answers, report_data, audit_completed_at, payment_link_id"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let paymentUrl: string | null = null;
  if (order?.status === "pending_payment" && order.payment_link_id) {
    const { data: link } = await supabase.from("payment_links").select("short_url, status").eq("id", order.payment_link_id).maybeSingle();
    if (link?.status === "created") paymentUrl = link.short_url;
  }

  return Response.json({ order: order ?? null, tenantId, paymentUrl }, { headers: { "Cache-Control": "no-store" } });
}
