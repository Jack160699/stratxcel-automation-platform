import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { canChangeMemberRole, canRemoveMember, countOwners } from "@/lib/tenants/invitations";
import type { TenantRole } from "@/lib/tenants/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({})) as { tenantId?: string; userId?: string; role?: string };
  if (!body.tenantId || !body.userId || !body.role) {
    return Response.json({ error: "tenantId, userId, and role are required." }, { status: 400 });
  }
  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "tenant:manage_members");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const { data: members, error } = await supabase.from("tenant_members").select("user_id, role").eq("tenant_id", body.tenantId);
  if (error) return Response.json({ error: "Could not load members." }, { status: 500 });
  const target = (members ?? []).find((row) => row.user_id === body.userId);
  if (!target) return Response.json({ error: "Member not found." }, { status: 404 });
  const decision = canChangeMemberRole({
    actorsRole: ctx.role,
    currentRole: target.role,
    nextRole: body.role,
    ownerCount: countOwners(members ?? []),
  });
  if (!decision.ok) {
    return Response.json({ error: decision.reason === "LAST_OWNER" ? "The last owner cannot be changed." : "That role change is not allowed." }, { status: 409 });
  }
  await supabase.from("tenant_members").update({ role: body.role as TenantRole }).eq("tenant_id", body.tenantId).eq("user_id", body.userId);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({})) as { tenantId?: string; userId?: string };
  if (!body.tenantId || !body.userId) {
    return Response.json({ error: "tenantId and userId are required." }, { status: 400 });
  }
  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "tenant:manage_members");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const { supabase } = getTenantServiceContext();
  const { data: members, error } = await supabase.from("tenant_members").select("user_id, role").eq("tenant_id", body.tenantId);
  if (error) return Response.json({ error: "Could not load members." }, { status: 500 });
  const target = (members ?? []).find((row) => row.user_id === body.userId);
  if (!target) return Response.json({ error: "Member not found." }, { status: 404 });
  const decision = canRemoveMember({
    actorsRole: ctx.role,
    targetRole: target.role,
    ownerCount: countOwners(members ?? []),
  });
  if (!decision.ok) {
    return Response.json({ error: decision.reason === "LAST_OWNER" ? "The last owner cannot be removed." : "That member cannot be removed." }, { status: 409 });
  }
  await supabase.from("tenant_members").delete().eq("tenant_id", body.tenantId).eq("user_id", body.userId);
  return Response.json({ ok: true });
}

