/**
 * Website credits (read-only) — surfaces the tenant's real
 * `website_maintenance` entitlement from `usage_entitlements` so the
 * "Create Your Website" workspace can show a cost before the user spends a
 * build, per the mission's credits requirement. Does not enforce or
 * consume anything (WEBSITE_ENTITLEMENT_ENFORCED is still off) and does not
 * modify Billing internals — it only reads the same table the billing page
 * derives its plan-tier copy from.
 */
import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { getEntitlementSummary } from "@stratxcel/payments-and-wallet";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  // Matches the permission surface of GET /api/platform/website-factory
  // (list projects) — tenant membership is the bar, no separate
  // permission key exists for the website module.
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const serviceDb = createSupabaseServiceClient();
  const summary = await getEntitlementSummary(serviceDb, tenantId);
  const website = summary.find((s) => s.metric === "website_maintenance") ?? null;

  return Response.json(
    {
      hasPlanEntitlement: website !== null,
      limit: website?.limit ?? null,
      used: website?.currentUsage ?? null,
      remaining: website?.remaining ?? null,
      isPaused: website?.isPaused ?? false,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
