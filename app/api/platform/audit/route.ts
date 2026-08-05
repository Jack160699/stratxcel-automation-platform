<<<<<<< HEAD
import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createPaymentLink } from "@stratxcel/payments-and-wallet";
=======
import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { listAuditEvents } from "@stratxcel/audit";
>>>>>>> origin/feat/stratxcel-core-product-experience

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

<<<<<<< HEAD
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, businessName, industry, websiteUrl, socialLinks, goals } = body;

    if (!tenantId || !businessName) {
      return Response.json({ error: "tenantId and businessName are required" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // 1. Create ₹999 payment link with payment_purpose = 'audit_fee'
    const link = await createPaymentLink(serviceDb, {
      tenantId,
      amountCents: 99900, // ₹999.00 GST inclusive
      currency: "INR",
      description: `Business Growth Audit — ${businessName}`,
      customerName: businessName,
      paymentPurpose: "audit_fee",
    });

    // 2. Insert audit_orders record
    const { data: auditOrder, error: insertErr } = await serviceDb
      .from("audit_orders")
      .insert({
        tenant_id: tenantId,
        user_id: ctx.userId,
        business_name: businessName,
        industry: industry ?? null,
        website_url: websiteUrl ?? null,
        social_links: socialLinks ?? [],
        goals: goals ?? null,
        audit_fee_cents: 99900,
        payment_link_id: link.id,
        status: "pending_payment",
      })
      .select("*")
      .single();

    if (insertErr) {
      return Response.json({ error: `Failed to create audit order: ${insertErr.message}` }, { status: 500 });
    }

    return Response.json({
      auditOrder,
      paymentLink: link,
      paymentUrl: link.short_url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process audit onboarding";
    return Response.json({ error: msg }, { status: 400 });
  }
=======
/**
 * Plain user-initiated read, covered by audit_events_tenant_read RLS (see
 * supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql) —
 * runs on the authenticated session client, not the service-role client.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const events = await listAuditEvents(ctx.supabase, tenantId, 100);
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
>>>>>>> origin/feat/stratxcel-core-product-experience
}
