import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/connectors/google/disconnect
 * Disconnects the Google integration for the tenant.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const body = await request.json().catch(() => ({}));
  const { supabase } = getTenantServiceContext();

  let tenantId = body.tenantId;
  if (!tenantId) {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = tenant?.id || "466e6195-a9f6-4576-8271-29fdae61c18a";
  }

  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("connector_connections")
      .update({ status: "disconnected", updated_at: now, last_error: null })
      .eq("connector_key", "google")
      .eq("tenant_id", tenantId),
    supabase
      .from("search_google_connections")
      .update({ status: "disconnected", updated_at: now, last_error: null })
      .eq("tenant_id", tenantId),
  ]);

  return Response.json({ success: true, message: "Google account disconnected." });
}
