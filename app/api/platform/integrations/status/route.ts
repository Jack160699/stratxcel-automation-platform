import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { provisionTenantConnectorsFromMetadata } from "@/lib/social/provisioning";
import { getTenantDigitalPresence } from "@/lib/connectors/canonical-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const service = createSupabaseServiceClient();

  // 1. Safe Auto-Reconciliation for onboarding metadata if relational tables are not yet provisioned
  const { data: authUserData } = await ctx.supabase.auth.getUser();
  const userMetadata = authUserData?.user?.user_metadata as Record<string, unknown> | undefined;
  const oauthConnections = (userMetadata?.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

  const userRole = "role" in ctx ? ctx.role : null;
  if (userRole === "owner" || userRole === "admin") {
    try {
      const [waCheck, socialCheck] = await Promise.all([
        service.from("whatsapp_phone_bindings").select("id").eq("tenant_id", tenantId).limit(1),
        service.from("social_accounts").select("id").eq("tenant_id", tenantId).limit(1),
      ]);

      const needsWa = (waCheck.data?.length ?? 0) === 0 && Boolean(oauthConnections.whatsapp || userMetadata?.onboarding_whatsapp_verification);
      const needsSocial = (socialCheck.data?.length ?? 0) === 0 && Object.keys(oauthConnections).some((k) => k !== "whatsapp");

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

  // 2. Query canonical digital presence ground truth
  const presenceSummary = await getTenantDigitalPresence(service, tenantId);
  const conns = presenceSummary.connections;

  // Map canonical states to legacy ConnectorState for backwards-compatibility
  const mapState = (state: string) => {
    if (state === "CONNECTED") return "connected" as const;
    if (state === "REAUTH_REQUIRED" || state === "ERROR") return "action_required" as const;
    if (state === "DISCOVERED_PUBLICLY") return "discovered_public" as const;
    return "setup_required" as const;
  };

  const presenceList = Object.values(conns).map((c) => ({
    key: c.provider,
    label: c.title,
    handle: c.handle,
    href: c.publicUrl,
    provenance: c.provenance,
    lastSync: c.lastSyncedAt,
    connectionState: c.connectionState,
    isDiscoveredPublicly: c.isDiscoveredPublicly,
  }));

  const canDirectConnect = ctx.role === "owner" || ctx.role === "admin";

  return Response.json(
    {
      tenantId,
      connections: conns,
      connectedCount: presenceSummary.connectedCount,
      discoveredCount: presenceSummary.discoveredCount,
      whatsapp: mapState(conns.whatsapp.connectionState),
      facebook: mapState(conns.facebook.connectionState),
      instagram: mapState(conns.instagram.connectionState),
      youtube: mapState(conns.youtube.connectionState),
      google: mapState(conns.google_business.connectionState),
      google_analytics: mapState(conns.google_analytics.connectionState),
      google_search_console: mapState(conns.google_search_console.connectionState),
      presence: presenceList,
      selfService: {
        google: true,
        social: canDirectConnect,
        whatsapp: false,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
