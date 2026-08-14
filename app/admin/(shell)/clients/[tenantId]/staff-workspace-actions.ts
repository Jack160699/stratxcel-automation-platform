"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenants/current-tenant";
import { getAgencyTenant } from "@/lib/tenants/admin-repository";
import { setStaffWorkspaceCookie, setWorkspaceModeCookie } from "@/lib/identity/staff-workspace";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function viewClientWorkspaceAction(tenantId: string): Promise<never> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) redirect("/admin");

  const targetTenant = await getAgencyTenant(tenantId);
  if (!targetTenant) redirect("/admin/clients?error=TENANT_NOT_FOUND");

  // Log auditable server-side admin access event
  try {
    const service = createSupabaseServiceClient();
    await service.from("platform_audit_events").insert({
      tenant_id: targetTenant.tenantId,
      actor_user_id: ctx.ownerId,
      event_type: "admin_client_workspace_viewed",
      metadata: {
        admin_user_id: ctx.ownerId,
        target_tenant_id: targetTenant.tenantId,
        target_tenant_slug: targetTenant.slug,
        target_tenant_name: targetTenant.name,
      },
    });
  } catch {
    // Non-fatal audit log catch
  }

  await setWorkspaceModeCookie(ctx.ownerId, "admin");
  await setStaffWorkspaceCookie(ctx.ownerId, tenantId);
  const store = await cookies();
  store.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  redirect("/app");
}
