import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { createPaymentLink, isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { ensurePendingAuditOrder, AUDIT_FEE_CENTS } from "@/lib/audit/ensure-pending-order";
import { isMissingRelation, resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { loadAuditWhatsAppDestination, toPublicDestination } from "@/lib/audit/v1/whatsapp-destination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CheckoutOrder {
  id: string;
  status: string;
  payment_link_id: string | null;
  business_name?: string | null;
}

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
  // Intentionally ignored if present — amount/product/discount are server-authoritative.
  promoCode?: string;
  amountDueCents?: number;
}

/**
 * Starts the payment-first ₹999 Audit. Two entry paths, same fee, same
 * purpose, same PAYMENTS_AUDIT_ENABLED gate.
 *
 * Complimentary Go Free fulfilment is a separate route
 * (/api/platform/audit/promo/redeem) and never creates a Razorpay link.
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

  if (user) {
    const identity = await resolveCanonicalIdentity();
    if (identity.state === "INTERNAL_STAFF" || identity.state === "STAFF_VIEWING_CLIENT") {
      return Response.json({ error: "Staff accounts cannot start customer checkout" }, { status: 403 });
    }
  }

  const { supabase: service } = getTenantServiceContext();

  let tenantId: string;
  let customerEmail: string | undefined;
  let guestEmail: string | null = null;
  let gstInvoice: GstInvoiceDetails | undefined;

  if (user) {
    const memberships = await listMembershipsForUser(supabase, user.id);
    if (memberships.length > 0) {
      tenantId = memberships[0]!.tenant.id;
    } else {
      const slug = `audit-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const tenant = await createTenant(service, { slug, name: "My Business", ownerUserId: user.id });
      tenantId = tenant.id;
    }
    customerEmail = user.email ?? undefined;
  } else {
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

  let auditOrderId: string;
  let existingPaymentLinkId: string | null = null;
  try {
    const ensured = await ensurePendingAuditOrder(service, {
      tenantId,
      guestEmail,
      gstInvoice: gstInvoice ? { ...gstInvoice } : null,
    });
    auditOrderId = ensured.auditOrderId;
    existingPaymentLinkId = ensured.paymentLinkId;
  } catch (err) {
    console.error("audit checkout: failed to ensure pending order", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }

  if (existingPaymentLinkId) {
    const { data: link } = await service
      .from("payment_links")
      .select("short_url, status")
      .eq("id", existingPaymentLinkId)
      .maybeSingle();
    if (link?.short_url && link.status === "created") {
      return Response.json(
        { paymentUrl: link.short_url, auditOrderId, amountDueCents: AUDIT_FEE_CENTS },
        { headers: { "Cache-Control": "no-store" } }
      );
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

    return Response.json(
      { paymentUrl: link.short_url, auditOrderId, amountDueCents: AUDIT_FEE_CENTS },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    console.error("audit checkout: payment link creation failed", message);
    return Response.json({ error: "Could not start checkout. Please try again or request a consultation." }, { status: 502 });
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return Response.json({ order: null }, { headers: { "Cache-Control": "no-store" } });

  const tenantId = memberships[0]!.tenant.id;
  const { supabase: service } = getTenantServiceContext();
  const currentOrderId = await resolveCurrentAuditOrderId(service, tenantId);

  let visibleOrder: CheckoutOrder | null = null;
  if (currentOrderId !== null) {
    let orderQuery = service
      .from("audit_orders")
      .select(
        "id, status, business_name, industry, website_url, social_links, goals, deep_dive_answers, goals_answers, report_data, audit_completed_at, payment_link_id, fulfilment_source, actual_paid_cents, discount_cents"
      )
      .eq("tenant_id", tenantId);
    if (typeof currentOrderId === "string") {
      orderQuery = orderQuery.eq("id", currentOrderId);
    } else {
      orderQuery = orderQuery.order("created_at", { ascending: false }).limit(1);
    }
    const { data: order } = await orderQuery.maybeSingle();
    visibleOrder = (order as CheckoutOrder | null) ?? null;
  }

  let paymentUrl: string | null = null;
  if (visibleOrder?.status === "pending_payment" && visibleOrder.payment_link_id) {
    const { data: link } = await supabase.from("payment_links").select("short_url, status").eq("id", visibleOrder.payment_link_id).maybeSingle();
    if (link?.status === "created") paymentUrl = link.short_url;
  }

  let generation: Record<string, unknown> | null = null;
  if (visibleOrder?.id) {
    const { data: run } = await service
      .from("audit_generation_runs")
      .select("id, status, stage, quality_outcome, confidence_band, failure_message_safe, stage_updated_at")
      .eq("audit_order_id", visibleOrder.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    generation = run ?? null;
  }

  const eligibility = await service.rpc("tenant_has_fresh_audit_grant", { p_tenant_id: tenantId });
  const eligible = isMissingRelation(eligibility.error) ? false : eligibility.data === true;
  const destination = await loadAuditWhatsAppDestination(service, tenantId);
  const brandBrain = await getCurrentBrandBrain(service, tenantId).catch(() => null);

  return Response.json({
    order: visibleOrder ?? null,
    tenantId,
    paymentUrl,
    generation,
    freshAuditEligible: eligible === true,
    whatsappDestination: destination ? toPublicDestination(destination) : null,
    brandBrain: brandBrain?.content ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
