import { requireTenantReadContext } from "@/lib/tenants/tenant-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { buildPresenceLinks } from "@/lib/audit/v1/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const [{ data, error }, brandBrain] = await Promise.all([
    ctx.supabase
      .from("whatsapp_phone_bindings")
      .select("status")
      .eq("tenant_id", tenantId),
    getCurrentBrandBrain(ctx.supabase, tenantId).catch(() => null),
  ]);
  if (error) return Response.json({ error: "Could not load connection status" }, { status: 500 });

  const statuses = (data ?? []).map((row) => row.status);
  const whatsapp = statuses.includes("active")
    ? "connected"
    : statuses.some((value) => value === "disabled" || value === "revoked")
      ? "action_required"
      : "setup_required";

  const social = await ctx.supabase
    .from("social_accounts")
    .select("platform, status")
    .eq("tenant_id", tenantId);
  const socialRows = social.error ? [] : (social.data ?? []);
  const platformStatus = (name: string) => {
    const row = socialRows.find((item) => String(item.platform).toLowerCase() === name);
    if (!row) return "setup_required" as const;
    const status = String(row.status).toUpperCase();
    if (status === "CONNECTED") return "connected" as const;
    if (status.includes("REAUTH") || status === "ERROR") return "action_required" as const;
    return "setup_required" as const;
  };

  const googleRow = await ctx.supabase
    .from("search_google_connections")
    .select("status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const googleStatus = googleRow.data?.status === "connected"
    ? "connected"
    : googleRow.data?.status === "error" || googleRow.data?.status === "revoked"
      ? "action_required"
      : "setup_required";
  const brandContent = brandBrain?.content as { website_url?: string; online_profiles?: unknown; channels?: unknown } | undefined;
  const onlineProfiles = Array.isArray(brandContent?.online_profiles)
    ? brandContent.online_profiles.filter((value): value is string => typeof value === "string")
    : Array.isArray(brandContent?.channels)
      ? brandContent.channels.filter((value): value is string => typeof value === "string")
      : [];
  const presence = buildPresenceLinks({
    websiteUrl: brandContent?.website_url,
    onlineProfiles,
  }).map((link) => ({
    key: link.key,
    label: link.label,
    handle: link.handle,
    href: link.href,
    provenance: link.provenance,
    lastSync: brandBrain?.updated_at ?? null,
  }));

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
      social: false,
      whatsapp: false,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
