import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { createPaymentLink, isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIT_FEE_CENTS = 99900; // ₹999.00, GST-inclusive — never derived from client input.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface GstInvoiceDetails {
  legalBusinessName?: string;
  gstin?: string;
  billingAddress?: string;
  state?: string;
  pin?: string;
}

interface GuestCheckoutBody {
  email?: string;
  gstInvoice?: GstInvoiceDetails;
}

/**
 * Starts the payment-first ₹999 Audit. Two entry paths, same fee, same
 * purpose, same PAYMENTS_AUDIT_ENABLED gate:
 *
 *  - Authenticated: get-or-create the caller's own tenant (unchanged from
 *    before — no request body is read on this path).
 *  - Guest (no session): create a bare, memberless tenant plus the
 *    audit_orders row against it, keyed to the email the visitor supplied.
 *    Nothing about the customer's business is asked here. The tenant has no
 *    owner until the purchase is claimed post-payment (see
 *    /api/platform/audit/claim) — that is the only account-creation-like
 *    side effect, and it grants no access to anyone until a verified email
 *    match proves who the purchase belongs to.
 *
 * The only thing either path ever charges is AUDIT_FEE_CENTS — no amount is
 * ever read from the request body. Every other payment surface (subscriptions,
 * wallet top-ups, domains, continuation packs) is untouched and stays off
 * regardless of this flag.
 *
 * Idempotent by design: a customer who reloads or comes back later gets the
 * same pending order and the same (or a freshly regenerated, if expired)
 * payment link — never a second ₹999 order while one is still payable.
 */
export async function POST(request: Request) {
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

  const { supabase: service } = getTenantServiceContext();

  let tenantId: string;
  let customerEmail: string | undefined;
  let guestEmail: string | null = null;
  let gstInvoice: GstInvoiceDetails | undefined;

  if (user) {
    // Reuse the customer's existing tenant, or create the smallest possible
    // one silently — a name and a random slug, nothing else. Identity, not
    // onboarding: no business details, no Brand Brain, no goals asked here.
    const memberships = await listMembershipsForUser(supabase, user.id);
    if (memberships.length > 0) {
      tenantId = memberships[0].tenant.id;
    } else {
      const slug = `audit-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const tenant = await createTenant(service, { slug, name: "My Business", ownerUserId: user.id });
      tenantId = tenant.id;
    }
    customerEmail = user.email ?? undefined;
  } else {
    // Guest checkout — no Stratxcel account exists yet. Only an email
    // (required to deliver/claim the purchase) and optional GST-invoice
    // details are ever read from the body; nothing else about the request
    // is trusted for anything beyond that.
    const body = (await request.json().catch(() => ({}))) as GuestCheckoutBody;
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }
    guestEmail = email;
    customerEmail = email;
    gstInvoice = body.gstInvoice;

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .insert({ slug: `audit-guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: "My Business" })
      .select("id")
      .single();
    if (tenantError || !tenant) {
      console.error("audit checkout: failed to create guest tenant", tenantError?.message);
      return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
    }
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
    if (guestEmail || gstInvoice) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (guestEmail) patch.guest_email = guestEmail;
      if (gstInvoice) {
        const { data: current } = await service.from("audit_orders").select("deep_dive_answers").eq("id", auditOrderId).single();
        patch.deep_dive_answers = { ...(current?.deep_dive_answers ?? {}), gstInvoice };
      }
      await service.from("audit_orders").update(patch).eq("id", auditOrderId);
    }
  } else {
    const { data: created, error } = await service
      .from("audit_orders")
      .insert({
        tenant_id: tenantId,
        business_name: "Pending — completed in intake",
        audit_fee_cents: AUDIT_FEE_CENTS,
        status: "pending_payment",
        guest_email: guestEmail,
        deep_dive_answers: gstInvoice ? { gstInvoice } : {},
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
      customerEmail,
      paymentPurpose: "audit_fee",
      createdBy: user?.id,
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
