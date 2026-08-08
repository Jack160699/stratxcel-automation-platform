import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { buildStaffPrincipal, buildClientPrincipal, type AgentPrincipal } from "@stratxcel/agent-core";

/**
 * Web-channel counterparts to resolveWhatsAppPrincipal (packages/agent-core's
 * phone-link resolver) — same principal shape, same permission source of
 * truth (buildStaffPrincipal/buildClientPrincipal), different identity
 * input: an authenticated session instead of a verified phone number. Lives
 * in the Next.js app (not packages/agent-core) because it needs
 * requirePlatformStaff/requireTenantContext, which are app-side code.
 */

export type WebPrincipalResult = { ok: true; principal: AgentPrincipal } | { ok: false; status: 401 | 403; error: string };

/** Resolves the current admin session as a staff AgentPrincipal for the
 *  admin_web channel. Staff are never tenant-scoped (tenantId always null),
 *  matching resolveWhatsAppPrincipal's staff branch exactly. */
export async function resolveAdminWebPrincipal(): Promise<WebPrincipalResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const staffAuth = await requirePlatformStaff(user.id);
  if (!staffAuth.ok) return { ok: false, status: staffAuth.status as 401 | 403, error: staffAuth.error };

  return {
    ok: true,
    principal: buildStaffPrincipal({ authUserId: user.id, tenantId: null, role: staffAuth.staff.role, channel: "admin_web" }),
  };
}

/** Resolves the current session as a client AgentPrincipal for the
 *  client_web channel, scoped strictly to the given tenant via
 *  requireTenantContext (never a client-supplied tenantId trusted as-is —
 *  requireTenantContext re-derives membership from tenant_members). */
export async function resolveClientWebPrincipal(tenantId: string): Promise<WebPrincipalResult> {
  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.error };

  return {
    ok: true,
    principal: buildClientPrincipal({ authUserId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role, channel: "client_web" }),
  };
}
