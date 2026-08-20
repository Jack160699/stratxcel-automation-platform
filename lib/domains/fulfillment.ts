import { selectDomainRegistrar } from "@stratxcel/websites-and-domains";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

type ServiceClient = ReturnType<typeof getTenantServiceContext>["supabase"];

/**
 * Best-effort domain registration, called after reconcile_and_fulfill_
 * razorpay_payment_v4 has already marked a domain `paid_pending_registration`
 * (that RPC only records the payment — it never calls an external registrar
 * API, which cannot happen inside a single Postgres transaction). Never
 * called from inside the payment webhook's own success response — see
 * app/api/webhook/razorpay/route.ts's issueBillingRecordsBestEffort for the
 * same non-blocking contract this follows.
 *
 * Idempotent: only acts on a domain currently in `paid_pending_registration`
 * (or `renewal_pending_provider` for renewals) — a second call against an
 * already-`active` domain is a safe no-op, so a retried webhook or a
 * duplicate cron tick can never double-register or double-renew.
 */
export async function fulfillDomainRegistrationBestEffort(supabase: ServiceClient, paymentOrderId: string): Promise<void> {
  try {
    const { data: order } = await supabase.from("payment_orders").select("reference_id").eq("id", paymentOrderId).maybeSingle();
    if (!order?.reference_id) return;

    const { data: link } = await supabase.from("payment_links").select("id").eq("reference_id", order.reference_id).maybeSingle();
    if (!link) return;

    const { data: domain, error } = await supabase.from("domains").select("*").eq("payment_link_id", link.id).maybeSingle();
    if (error || !domain) return;

    if (domain.status === "paid_pending_registration") {
      await registerDomain(supabase, domain);
    } else if (domain.status === "renewal_paid_pending_provider") {
      await renewDomain(supabase, domain);
    }
    // Any other status: already handled (active/failed/etc.) — no-op.
  } catch (err) {
    console.error(`[Domain Fulfilment] Unexpected error for payment order ${paymentOrderId}`, err);
  }
}

async function registerDomain(supabase: ServiceClient, domain: Record<string, any>): Promise<void> {
  const registrar = selectDomainRegistrar();

  if (registrar.mode === "disabled") {
    // No real registrar configured — leave the domain in its paid,
    // awaiting-registration state rather than fabricating success. Support
    // can see exactly this state and knows what's blocking it.
    return;
  }

  // Claim: only one caller may transition this row out of
  // paid_pending_registration — a concurrent duplicate call loses the race
  // harmlessly (0 rows updated) rather than registering twice.
  const { data: claimed } = await supabase
    .from("domains")
    .update({ status: "registering", updated_at: new Date().toISOString() })
    .eq("id", domain.id)
    .eq("status", "paid_pending_registration")
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  try {
    const result = await registrar.registerDomain({
      domainName: domain.domain_name,
      tenantId: domain.tenant_id,
      registrant: {
        name: domain.registrant_name,
        email: domain.registrant_email,
        phone: domain.registrant_phone,
        organization: domain.registrant_organization ?? undefined,
        address: domain.registrant_address ?? undefined,
        city: domain.registrant_city ?? undefined,
        state: domain.registrant_state ?? undefined,
        country: domain.registrant_country ?? "IN",
        postalCode: domain.registrant_postal_code ?? undefined,
      },
    });

    if (!result.success) {
      await supabase
        .from("domains")
        .update({ status: "failed", last_registrar_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", domain.id);
      return;
    }

    await registrar.setupDnsRecords(domain.domain_name, result.dnsRecords);

    await supabase
      .from("domains")
      .update({
        status: "active",
        provider: registrar.providerName,
        provider_domain_id: result.providerDomainId,
        expires_at: result.expiresAt,
        dns_configured: true,
        dns_observed: result.dnsRecords,
        last_registrar_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain.id);

    // If linked to a site project, advance the deployment pipeline
    if (domain.site_project_id) {
      await advanceSiteProjectAfterDomainRegistration(supabase, domain.site_project_id, domain.tenant_id, domain.domain_name);
    }
  } catch (err) {
    await supabase
      .from("domains")
      .update({
        status: "failed",
        last_registrar_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain.id);
    console.error(`[Domain Fulfilment] Registration failed for ${domain.domain_name}`, err);
  }
}

async function advanceSiteProjectAfterDomainRegistration(
  supabase: ServiceClient,
  siteProjectId: string,
  tenantId: string,
  domainName: string
): Promise<void> {
  try {
    const { selectHostingProvider } = await import("@stratxcel/websites-and-domains");
    const hosting = selectHostingProvider();

    // 1. Assign custom domain to hosting project
    const domainAttach = await hosting.assignCustomDomain(siteProjectId, domainName);

    // 2. Mark project live and domain verified
    await supabase.rpc("transition_website_deployment", {
      p_site_project_id: siteProjectId,
      p_tenant_id: tenantId,
      p_from_status: "DEPLOYING",
      p_to_status: "LIVE",
      p_metadata: {
        production_url: `https://${domainName}`,
        ssl_status: domainAttach.sslActive ? "SSL_ACTIVE" : "SSL_PENDING",
        qa_status: "PASSED",
      },
    });

    // 3. Enable AI agent if one exists for this site
    await supabase
      .from("website_agents")
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq("site_project_id", siteProjectId);

    // 4. Update domains vercel state
    await supabase
      .from("domains")
      .update({
        vercel_attached: domainAttach.configured,
        vercel_ssl_active: domainAttach.sslActive,
        vercel_attachment_status: domainAttach.sslActive ? "live" : "verifying",
        updated_at: new Date().toISOString(),
      })
      .eq("site_project_id", siteProjectId);
  } catch (err) {
    console.error(`[Domain Fulfilment] Failed to advance site project ${siteProjectId}:`, err);
  }
}

async function renewDomain(supabase: ServiceClient, domain: Record<string, any>): Promise<void> {
  const registrar = selectDomainRegistrar();
  if (registrar.mode === "disabled") return;

  const { data: claimed } = await supabase
    .from("domains")
    .update({ status: "registering", updated_at: new Date().toISOString() })
    .eq("id", domain.id)
    .eq("status", "renewal_paid_pending_provider")
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  try {
    const result = await registrar.renewDomain(domain.domain_name);
    if (!result.success) {
      await supabase.from("domains").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", domain.id);
      return;
    }
    await supabase
      .from("domains")
      .update({
        status: "active",
        expires_at: result.expiresAt,
        last_registrar_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain.id);
  } catch (err) {
    await supabase.from("domains").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", domain.id);
    console.error(`[Domain Fulfilment] Renewal failed for ${domain.domain_name}`, err);
  }
}
