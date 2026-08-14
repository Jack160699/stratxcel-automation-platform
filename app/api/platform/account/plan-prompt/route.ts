import { requireTenantContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : null;
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data: userResult, error: userError } = await ctx.supabase.auth.getUser();
  if (userError || !userResult.user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const existing = Array.isArray(userResult.user.user_metadata?.stratxcel_plan_prompt_seen)
    ? userResult.user.user_metadata.stratxcel_plan_prompt_seen.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const seen = [...new Set([...existing, tenantId])];
  const { error } = await ctx.supabase.auth.updateUser({
    data: { stratxcel_plan_prompt_seen: seen },
  });
  if (error) return Response.json({ error: "Could not save this preference" }, { status: 500 });

  return Response.json({ ok: true });
}
