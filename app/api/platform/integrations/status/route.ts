import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { buildPresenceLinks } from "@/lib/audit/v1/presence";
import { provisionTenantConnectorsFromMetadata } from "@/lib/social/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // 1. Initial query of canonical tenant connector tables
  let [{ data: waData, error: waError }, brandBrain, socialRes, googleRow] = await Promise.all([
    ctx.supabase
      .from("whatsapp_phone_bindings")
      .select("status")
      .eq("tenant_id", tenantId),
    getCurrentBrandBrain(ctx.supabase, tenantId).catch(() => null),
    ctx.supabase
      .from("social_accounts")
      .select("platform, status")
      .eq("tenant_id", tenantId),
    ctx.supabase
      .from("search_google_connections")
      .select("status")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (waError) return Response.json({ error: "Could not load connection status" }, { status: 500 });

  let socialRows = socialRes.error ? [] : (socialRes.data ?? []);
  let statuses = (waData ?? []).map((row) => row.status);

  // 2. Safe Auto-Reconciliation for existing users whose onboarding metadata was not yet provisioned to tenant tables
  const { data: authUserData } = await ctx.supabase.auth.getUser();
  const userMetadata = authUserData?.user?.user_metadata as Record<string, unknown> | undefined;
  const oauthConnections = (userMetadata?.onboarding_oauth_connections ?? {}) as Record<string, unknown>;
  const hasUnprovisionedMetadata =
    (statuses.length === 0 && Boolean(oauthConnections.whatsapp || userMetadata?.onboarding_whatsapp_verification)) ||
    (socialRows.length === 0 && Object.keys(oauthConnections).some((k) => k !== "whatsapp"));

  const userRole = "role" in ctx ? ctx.role : null;
  if (hasUnprovisionedMetadata && (userRole === "owner" || userRole === "admin")) {
    try {
      await provisionTenantConnectorsFromMetadata(ctx.supabase, {
        tenantId,
        userId: ctx.userId,
        userMetadata,
      });

      // Re-read canonical tables after reconciliation
      const [nextWa, nextSocial, nextGoogle] = await Promise.all([
        ctx.supabase.from("whatsapp_phone_bindings").select("status").eq("tenant_id", tenantId),
        ctx.supabase.from("social_accounts").select("platform, status").eq("tenant_id", tenantId),
        ctx.supabase.from("search_google_connections").select("status").eq("tenant_id", tenantId).maybeSingle(),
      ]);

      if (!nextWa.error && nextWa.data) {
        waData = nextWa.data;
        statuses = (waData ?? []).map((row) => row.status);
      }
      if (!nextSocial.error && nextSocial.data) {
        socialRows = nextSocial.data;
      }
      if (!nextGoogle.error) {
        googleRow = nextGoogle;
      }
    } catch (reconcileErr) {
      console.warn("integrations/status: non-fatal auto-reconciliation trace", reconcileErr);
    }
  }

  const whatsapp = statuses.includes("active")
    ? "connected"
    : statuses.some((value) => value === "disabled" || value === "revoked")
      ? "action_required"
      : "setup_required";

  const platformStatus = (name: string) => {
    const row = socialRows.find((item) => String(item.platform).toLowerCase() === name);
    if (!row) return "setup_required" as const;
    const status = String(row.status).toUpperCase();
    if (status === "CONNECTED") return "connected" as const;
    if (status.includes("REAUTH") || status === "ERROR") return "action_required" as const;
    return "setup_required" as const;
  };

  const googleStatus = googleRow.data?.status === "connected"
    ? "connected"
    : googleRow.data?.status === "error" || googleRow.data?.status === "revoked"
      ? "action_required"
      : "setup_required";

  const brandContent = brandBrain?.content as Record<string, unknown> | undefined;
  const rawProfiles: string[] = [
    ...(Array.isArray(brandContent?.online_profiles) ? brandContent.online_profiles : []),
    ...(Array.isArray(brandContent?.channels) ? brandContent.channels : []),
    ...(Array.isArray(brandContent?.verified_social_links)
      ? brandContent.verified_social_links.map((s: any) => s.url || s.handle || s.platform)
      : []),
  ];
  const onlineProfiles = [...new Set(rawProfiles.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];

  const presence = buildPresenceLinks({
    websiteUrl: typeof brandContent?.website_url === "string" ? brandContent.website_url : undefined,
    onlineProfiles,
  }).map((link) => ({
    key: link.key,
    label: link.label,
    handle: link.handle,
    href: link.href,
    provenance: link.provenance,
    lastSync: brandBrain?.updated_at ?? null,
  }));

  const canDirectConnect = ctx.role === "owner" || ctx.role === "admin";

  return Response.json({
    whatsapp,
    facebook: platformStatus("facebook"),
    instagram: platformStatus("instagram"),
    threads: platformStatus("threads"),
    youtube: platformStatus("youtube"),
    linkedin: platformStatus("linkedin"),
    google: googleStatus,
    presence,
    selfService: {
      google: true,
      social: canDirectConnect,
      whatsapp: false,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
