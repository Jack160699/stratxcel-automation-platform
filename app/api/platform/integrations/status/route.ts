import { requireTenantReadContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.supabase
    .from("whatsapp_phone_bindings")
    .select("status")
    .eq("tenant_id", tenantId);
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

  return Response.json({
    whatsapp,
    facebook: platformStatus("facebook"),
    instagram: platformStatus("instagram"),
    threads: platformStatus("threads"),
    youtube: platformStatus("youtube"),
    linkedin: platformStatus("linkedin"),
    google: googleStatus,
    selfService: {
      google: true,
      social: false,
      whatsapp: false,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
