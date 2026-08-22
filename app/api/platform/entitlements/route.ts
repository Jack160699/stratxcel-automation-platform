/**
 * Full entitlement snapshot (read-only) — surfaces every real
 * `usage_entitlements` row for the tenant (social_posts, meta_ad_campaigns,
 * whatsapp_contacts, website_maintenance) so Billing can show honest credit
 * and usage numbers instead of the plan's static definition. Modeled
 * directly on GET /api/platform/website-factory/credits (same tenant-read
 * gate, same getEntitlementSummary call, same table) — this route just
 * returns the whole summary instead of one metric. Does not enforce or
 * consume anything.
 */
import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { getEntitlementSummary } from "@stratxcel/payments-and-wallet";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const serviceDb = createSupabaseServiceClient();
  const summary = await getEntitlementSummary(serviceDb, tenantId);

  return Response.json({ entitlements: summary }, { headers: { "Cache-Control": "no-store" } });
}
