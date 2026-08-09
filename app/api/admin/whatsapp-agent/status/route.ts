import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getOwnWhatsAppPrincipalStatus, resolveAgentTools, capabilityGroupsFromTools } from "@stratxcel/agent-core";
import { resolveAdminWebPrincipal } from "@/lib/agent-core/web-principal";
import { SOCIAL_DELEGATION_TOOLS } from "@/lib/agent-core/social-delegation-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status of the authenticated staff caller's OWN WhatsApp agent link.
 *  Platform staff are not tenant-scoped, so identity is resolved directly
 *  from the Supabase session, never through tenant membership. Never
 *  returns another user's phone number or link status. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const staffAuth = await requirePlatformStaff(user.id);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase: serviceDb } = getTenantServiceContext();
  const status = await getOwnWhatsAppPrincipalStatus(serviceDb, user.id);
  const resolved = await resolveAdminWebPrincipal();
  if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status });
  const capabilities = capabilityGroupsFromTools(resolveAgentTools(resolved.principal, { extraTools: SOCIAL_DELEGATION_TOOLS }));
  const { data: recent } = await serviceDb.from("agent_messages").select("role, created_at").in("session_id", (
    await serviceDb.from("agent_sessions").select("id").eq("auth_user_id", user.id).order("updated_at", { ascending: false }).limit(5)
  ).data?.map((row: any) => row.id) ?? []).order("created_at", { ascending: false }).limit(5);
  return Response.json({
    ...status,
    identity: { displayName: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null, email: user.email ?? null },
    role: resolved.principal.role,
    department: resolved.principal.kind === "staff" ? resolved.principal.department ?? null : null,
    accessProfile: resolved.principal.kind === "staff" ? resolved.principal.accessProfile ?? "role_default" : "role_default",
    capabilities,
    connectionHealth: status.linked ? "healthy" : "not_connected",
    channelStatus: "live",
    recentActivity: (recent ?? []).map((row: any) => ({ kind: row.role === "user" ? "request" : "reply", at: row.created_at })),
  }, { headers: { "Cache-Control": "no-store" } });
}
