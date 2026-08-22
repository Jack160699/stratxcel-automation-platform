import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { provisionTenantConnectorsFromMetadata } from "@/lib/social/provisioning";
import { getTenantDigitalPresence } from "@/lib/connectors/canonical-status";
import { loadIntegrationsStatusData } from "@/lib/connectors/load-integrations-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const service = createSupabaseServiceClient();

  // 1. Safe Auto-Reconciliation for onboarding metadata if relational tables are not yet provisioned
  const userMetadata = ctx.userMetadata;
  const oauthConnections = (userMetadata?.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

  const userRole = "role" in ctx ? ctx.role : null;
  if (userRole === "owner" || userRole === "admin") {
    try {
      // Per-provider gap check, not "does social_accounts have ANY row" --
      // the previous all-or-nothing gate meant that once a single provider
      // persisted correctly, reconciliation stopped running for this tenant
      // forever, silently stranding every other provider that was ever
      // metadata-only (e.g. connected before the tenant existed) with no
      // path to ever reach the canonical tables. Compare the actual set of
      // providers proven in metadata against what's already persisted, and
      // only run provisioning when there's a real gap.
      const [waCheck, socialCheck] = await Promise.all([
        service.from("whatsapp_phone_bindings").select("id").eq("tenant_id", tenantId).limit(1),
        service.from("social_accounts").select("platform").eq("tenant_id", tenantId),
      ]);

      const needsWa = (waCheck.data?.length ?? 0) === 0 && Boolean(oauthConnections.whatsapp || userMetadata?.onboarding_whatsapp_verification);
      const persistedPlatforms = new Set((socialCheck.data ?? []).map((row) => String(row.platform)));
      const metadataPlatforms = Object.keys(oauthConnections).filter((k) => k !== "whatsapp" && k !== "google" && k !== "google_search");
      const needsSocial = metadataPlatforms.some((platform) => !persistedPlatforms.has(platform === "google" ? "google_business" : platform));

      if (needsWa || needsSocial) {
        await provisionTenantConnectorsFromMetadata(service, {
          tenantId,
          userId: ctx.userId,
          userMetadata,
        });
      }
    } catch (reconcileErr) {
      console.warn("integrations/status: non-fatal auto-reconciliation trace", reconcileErr);
    }
  }

  const data = await loadIntegrationsStatusData(service, tenantId, userRole);
  const presenceSummary = await getTenantDigitalPresence(service, tenantId);

  return Response.json(
    {
      tenantId,
      connections: presenceSummary.connections,
      connectedCount: presenceSummary.connectedCount,
      discoveredCount: presenceSummary.discoveredCount,
      ...data,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
