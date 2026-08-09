import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { resolveEffectiveStaffPermissions, STAFF_ACCESS_PROFILE_PERMISSIONS } from "@stratxcel/agent-core";

async function requireOwner() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not authenticated" };
  const auth = await requirePlatformStaff(user.id, ["platform_owner"]);
  return auth.ok ? { ok: true as const, user } : { ok: false as const, status: auth.status, error: auth.error };
}

export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const { supabase } = getTenantServiceContext();
  const [{ data: staff, error }, { data: access }, { data: links }, users] = await Promise.all([
    supabase.from("platform_staff_users").select("user_id, role, is_active, created_at").order("created_at"),
    supabase.from("platform_staff_agent_access").select("user_id, department, access_profile, permission_grants, permission_denials, updated_at"),
    supabase.from("whatsapp_channel_principals").select("auth_user_id, normalized_phone, status, verified_at, last_used_at").eq("principal_type", "staff"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (error || users.error) return Response.json({ error: "Unable to load staff access" }, { status: 503 });
  const accessByUser = new Map((access ?? []).map((row: any) => [row.user_id, row]));
  const linkByUser = new Map((links ?? []).map((row: any) => [row.auth_user_id, row]));
  const userById = new Map(users.data.users.map((user) => [user.id, user]));
  return Response.json({ members: (staff ?? []).map((row: any) => {
    const profile: any = accessByUser.get(row.user_id);
    const link: any = linkByUser.get(row.user_id);
    const user = userById.get(row.user_id);
    return { userId: row.user_id, name: user?.user_metadata?.full_name ?? null, email: user?.email ?? null, role: row.role, isActive: row.is_active, department: profile?.department ?? null, accessProfile: profile?.access_profile ?? "role_default", permissionGrants: profile?.permission_grants ?? [], permissionDenials: profile?.permission_denials ?? [], availablePermissions: resolveEffectiveStaffPermissions(row.role), link: link ? { status: link.status, maskedPhone: `${"•".repeat(Math.max(link.normalized_phone.length - 2, 0))}${link.normalized_phone.slice(-2)}`, verifiedAt: link.verified_at, lastUsedAt: link.last_used_at } : null };
  }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as any;
  if (!body?.userId || !body?.accessProfile) return Response.json({ error: "Invalid access update" }, { status: 400 });
  const { supabase } = getTenantServiceContext();
  const { data: target } = await supabase.from("platform_staff_users").select("role, is_active").eq("user_id", body.userId).maybeSingle<{role:string;is_active:boolean}>();
  if (!target?.is_active) return Response.json({ error: "Active platform staff identity required" }, { status: 404 });
  const requested = body.accessProfile === "custom" ? (Array.isArray(body.permissionGrants) ? body.permissionGrants : []) : (STAFF_ACCESS_PROFILE_PERMISSIONS[body.accessProfile] ?? null);
  if (!requested) return Response.json({ error: "Unknown access profile" }, { status: 400 });
  const effective = resolveEffectiveStaffPermissions(target.role, { access_profile: body.accessProfile, permission_grants: requested, permission_denials: Array.isArray(body.permissionDenials) ? body.permissionDenials : [] });
  const storedGrants = body.accessProfile === "custom" ? effective : requested;
  const allowedDenials = (Array.isArray(body.permissionDenials) ? body.permissionDenials : []).filter((permission: string) => resolveEffectiveStaffPermissions(target.role).includes(permission));
  const { error } = await supabase.from("platform_staff_agent_access").upsert({ user_id: body.userId, department: body.department ?? null, access_profile: body.accessProfile, permission_grants: storedGrants, permission_denials: allowedDenials, updated_by: auth.user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return Response.json({ error: "Unable to update Agent access" }, { status: 503 });
  return Response.json({ updated: true, effectivePermissions: effective });
}

export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as any;
  if (!body?.userId) return Response.json({ error: "Invalid staff identity" }, { status: 400 });
  const { supabase } = getTenantServiceContext();
  const { data: target } = await supabase.from("platform_staff_users").select("is_active").eq("user_id", body.userId).maybeSingle<{is_active:boolean}>();
  if (!target?.is_active) return Response.json({ error: "Active platform staff identity required" }, { status: 404 });
  const { error } = await supabase.from("whatsapp_channel_principals").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("auth_user_id", body.userId).eq("principal_type", "staff").eq("status", "active");
  if (error) return Response.json({ error: "Unable to revoke WhatsApp access" }, { status: 503 });
  return Response.json({ revoked: true });
}
