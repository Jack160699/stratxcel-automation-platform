import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createPaymentLink } from "@stratxcel/payments-and-wallet";
import { SandboxDomainRegistrar, attachDomainToVercel } from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    // 2. Perform registrar registration (with legal client registrant ownership)
    const regResult = await registrar.registerDomain({
      domainName,
      tenantId,
      registrant,
    });

    // 3. Attach domain to Vercel production project
    const vercelStatus = await attachDomainToVercel(domainName);

    // 4. Store domain in database
    const { data: dbDomain, error: insertErr } = await serviceDb
      .from("domains")
      .insert({
        tenant_id: tenantId,
        domain_name: domainName,
        provider: regResult.provider,
        provider_domain_id: regResult.providerDomainId,
        registrant_name: registrant.name,
        registrant_email: registrant.email,
        registrant_phone: registrant.phone ?? "",
        registrant_organization: registrant.organization ?? null,
        registrant_address: registrant.address ?? null,
        registrant_city: registrant.city ?? null,
        registrant_state: registrant.state ?? null,
        registrant_country: registrant.country ?? "IN",
        registrant_postal_code: registrant.postalCode ?? null,
        status: regResult.status === "active" ? "active" : "pending_payment",
        purchase_price_cents: searchRes.priceCents,
        renewal_price_cents: searchRes.renewalPriceCents,
        payment_link_id: link.id,
        dns_configured: regResult.dnsRecords.length > 0,
        vercel_attached: vercelStatus.verified,
        vercel_ssl_active: vercelStatus.sslActive,
        site_project_id: siteProjectId ?? null,
        expires_at: regResult.expiresAt,
      })
      .select("*")
      .single();

    if (insertErr) {
      return Response.json({ error: `Failed to record domain: ${insertErr.message}` }, { status: 500 });
    }

    return Response.json({
      domain: dbDomain,
      paymentLink: link,
      paymentUrl: link.short_url,
      vercelStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process domain purchase";
    return Response.json({ error: msg }, { status: 400 });
  }
}
