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
  return Response.json({ whatsapp }, { headers: { "Cache-Control": "private, no-store" } });
}
