import { requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { resolveCanonicalWebsite } from "@stratxcel/search-discovery";
import { detectWebsitePlatform } from "@/lib/audit/v1/platform-detection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/search/website/detect-platform?tenantId=...
 *
 * Real, independent hosting/build-platform detection (STRATXCEL PRODUCTION
 * REPAIR mission, Section 16) -- distinct from
 * app/api/platform/search/website/status/route.ts's `detectedPlatform`,
 * which can only ever report a platform once Vercel is already connected.
 * This route works for ANY website, connected or not, so the customer-
 * facing card can offer the right connector CTA (or none at all) instead
 * of always defaulting to "Connect Vercel". Deliberately a separate,
 * lightweight, non-blocking call from /status -- detection makes one real
 * network request to the customer's own site (SSRF-protected, 6s timeout
 * budget), which must never add latency to the page's primary status load.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "MISSING_TENANT_ID" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();
  const website = await resolveCanonicalWebsite(supabase, tenantId);

  if (!website?.url) {
    return Response.json({ platform: "unknown", confidence: "none", detectionSource: [], checkedAt: new Date().toISOString() });
  }

  const result = await detectWebsitePlatform(website.url);
  return Response.json(result);
}
