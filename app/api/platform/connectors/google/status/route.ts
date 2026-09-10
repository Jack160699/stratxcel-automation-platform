import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { fetchGoogleHubStatus } from "@/lib/connectors/google-oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/connectors/google/status?tenantId=...
 * Returns the current Google OAuth connection status, authorized account,
 * granted scopes, and granular capability evaluation for all Google services.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const url = new URL(request.url);
  let tenantId = url.searchParams.get("tenantId");

  const { supabase } = getTenantServiceContext();

  if (!tenantId) {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = tenant?.id ?? "466e6195-a9f6-4576-8271-29fdae61c18a";
  }
  const resolvedTenantId: string = tenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";

  const hubStatus = await fetchGoogleHubStatus(supabase, resolvedTenantId);

  return Response.json(hubStatus);
}
