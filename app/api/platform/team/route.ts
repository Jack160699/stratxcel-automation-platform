import { requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamMember {
  userId: string;
  role: string;
  email: string | null;
  createdAt: string;
}

/**
 * Lists real tenant_members for the active tenant. tenant_members' only
 * read policy (tenant_members_self_read, see
 * supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql)
 * restricts a session client to its OWN row — there is no "read my
 * teammates" policy — so listing every member genuinely requires the
 * service client, gated first by requireTenantContext confirming the
 * caller is themselves a member of this exact tenant. Emails are resolved
 * via the Supabase Admin API (auth.admin.getUserById) since tenant_members
 * stores only user_id and there is no profiles table. This never touches
 * stratxcel_admins — that table is Stratxcel's own staff list, structurally
 * unrelated to tenant membership (see lib/social/db-context.ts).
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();
  const { data: rows, error } = await supabase
    .from("tenant_members")
    .select("user_id, role, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const members: TeamMember[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      let email: string | null = null;
      if (row.user_id === ctx.userId && ctx.userEmail) {
        email = ctx.userEmail;
      } else {
        try {
          const { data } = await supabase.auth.admin.getUserById(row.user_id);
          email = data.user?.email ?? null;
        } catch {
          email = null;
        }
      }
      return { userId: row.user_id, role: row.role, email, createdAt: row.created_at };
    })
  );

  return Response.json({ members, currentUserId: ctx.userId }, { headers: { "Cache-Control": "no-store" } });
}
