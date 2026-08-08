import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getVercelDomainStatus, attachDomainToVercel } from "@stratxcel/websites-and-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DNS_RECORDS_FOR_VERCEL = [
  { type: "A", name: "@", value: "76.76.21.21" },
  { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
];

/**
 * Attaches (if not yet attempted) and polls the real Vercel-reported state
 * for a customer's active domain — never marks a domain "live" from
 * anything other than Vercel's own verified+certificate state. Persists
 * expected-vs-observed DNS so a customer/support can see exactly what's
 * misconfigured. Never touches stratxcel.in — this only ever operates on
 * rows from this tenant's own `domains` table.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase: serviceDb } = getTenantServiceContext();
  const { data: domain, error } = await serviceDb.from("domains").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error || !domain) return Response.json({ error: "Domain not found" }, { status: 404 });

  if (domain.status !== "active") {
    return Response.json({ domain, vercel: null, message: "Domain is not yet active — nothing to attach." });
  }

  let vercelStatus;
  if (domain.vercel_attachment_status === "not_started") {
    vercelStatus = await attachDomainToVercel(domain.domain_name);
  } else {
    vercelStatus = await getVercelDomainStatus(domain.domain_name);
  }

  const newAttachmentStatus = !vercelStatus.configured
    ? domain.vercel_attachment_status === "not_started"
      ? "not_started"
      : "failed"
    : vercelStatus.sslActive
      ? "live"
      : vercelStatus.verified
        ? "ssl_pending"
        : "pending_dns";

  const { data: updated, error: updateErr } = await serviceDb
    .from("domains")
    .update({
      vercel_attached: vercelStatus.configured,
      vercel_ssl_active: vercelStatus.sslActive,
      vercel_attachment_status: newAttachmentStatus,
      dns_expected: DNS_RECORDS_FOR_VERCEL,
      last_registrar_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  return Response.json({ domain: updated, vercel: vercelStatus });
}
