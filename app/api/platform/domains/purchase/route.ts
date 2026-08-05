import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createPaymentLink, isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";
import { SandboxDomainRegistrar } from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_DOMAINS_ENABLED")) {
    return Response.json(
      { error: "Domain purchase checkout is currently restricted for safety certification." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, domainName, registrant, siteProjectId } = body;

    if (!tenantId || !domainName || !registrant || !registrant.name || !registrant.email) {
      return Response.json(
        { error: "tenantId, domainName, and client legal registrant details (name, email, phone) are required" },
        { status: 400 }
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const registrar = new SandboxDomainRegistrar();
    const searchRes = await registrar.searchDomain(domainName);
    if (!searchRes.available) {
      return Response.json({ error: `Domain ${domainName} is not available` }, { status: 400 });
    }

    const { supabase: serviceDb } = getTenantServiceContext();

    // 1. Create Razorpay payment link with payment_purpose = 'domain_purchase'
    const link = await createPaymentLink(serviceDb, {
      tenantId,
      amountCents: searchRes.priceCents,
      currency: searchRes.currency,
      description: `Domain Purchase: ${domainName} (1 Year — Registered to ${registrant.name})`,
      paymentPurpose: "domain_purchase",
    });

    // 2. Store domain in database in pending_payment state (DO NOT register or activate domain before verified payment)
    const { data: dbDomain, error: insertErr } = await serviceDb
      .from("domains")
      .insert({
        tenant_id: tenantId,
        domain_name: domainName,
        provider: "sandbox",
        provider_domain_id: null,
        registrant_name: registrant.name,
        registrant_email: registrant.email,
        registrant_phone: registrant.phone ?? "",
        registrant_organization: registrant.organization ?? null,
        registrant_address: registrant.address ?? null,
        registrant_city: registrant.city ?? null,
        registrant_state: registrant.state ?? null,
        registrant_country: registrant.country ?? "IN",
        registrant_postal_code: registrant.postalCode ?? null,
        status: "pending_payment",
        purchase_price_cents: searchRes.priceCents,
        renewal_price_cents: searchRes.renewalPriceCents,
        payment_link_id: link.id,
        dns_configured: false,
        vercel_attached: false,
        vercel_ssl_active: false,
        site_project_id: siteProjectId ?? null,
        expires_at: null,
      })
      .select("*")
      .single();

    if (insertErr) {
      return Response.json({ error: `Failed to record domain request: ${insertErr.message}` }, { status: 500 });
    }

    return Response.json({
      domain: dbDomain,
      paymentLink: link,
      paymentUrl: link.short_url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process domain purchase request";
    return Response.json({ error: msg }, { status: 400 });
  }
}
