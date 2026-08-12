"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwnerContext } from "@/lib/social/db-context";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenants/current-tenant";
import { getAgencyTenant } from "@/lib/tenants/admin-repository";
import { setStaffWorkspaceCookie } from "@/lib/identity/staff-workspace";

export async function viewClientWorkspaceAction(tenantId: string): Promise<never> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) redirect("/admin");
  if (!(await getAgencyTenant(tenantId))) redirect("/admin/clients");

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
