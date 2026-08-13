import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { inviteMember } from "@/lib/tenants/repository";
import { hashInviteToken } from "@/lib/tenants/invitations";
import type { TenantRole } from "@/lib/tenants/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: string };
  if (!body.token?.trim()) return Response.json({ error: "Invite token is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Sign in to accept this invite." }, { status: 401 });

  const { supabase: service } = getTenantServiceContext();
  const tokenHash = hashInviteToken(body.token.trim());
  const { data: invite, error } = await service
    .from("tenant_invitations")
    .select("id, tenant_id, email, role, expires_at, accepted_at, revoked_at, invited_by")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !invite) return Response.json({ error: "Invite not found." }, { status: 404 });
  if (invite.revoked_at) return Response.json({ error: "This invite was revoked." }, { status: 409 });
  if (invite.accepted_at) return Response.json({ error: "This invite was already used." }, { status: 409 });
  if (new Date(invite.expires_at).getTime() <= Date.now()) return Response.json({ error: "This invite has expired." }, { status: 409 });
  if (String(invite.email).toLowerCase() !== user.email.toLowerCase()) {
    return Response.json({ error: "Sign in with the invited email address to accept." }, { status: 403 });
  }

  const { data: existing } = await service
    .from("tenant_members")
    .select("user_id, role")
    .eq("tenant_id", invite.tenant_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await service.from("tenant_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    return Response.json({ ok: true, alreadyMember: true, tenantId: invite.tenant_id });
  }

  await inviteMember(service, {
    tenantId: invite.tenant_id,
    userId: user.id,
    role: invite.role as TenantRole,
    invitedBy: invite.invited_by,
  });
  await service.from("tenant_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  return Response.json({ ok: true, tenantId: invite.tenant_id, role: invite.role });
}
