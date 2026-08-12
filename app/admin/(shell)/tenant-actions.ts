"use server";

import { cookies } from "next/headers";
import { requireOwnerContext } from "@/lib/social/db-context";
import { ensureAdminStaffWorkspace } from "@/lib/identity/admin-staff-workspace";
import { ACTIVE_TENANT_COOKIE, isMemberOfTenant } from "@/lib/tenants/current-tenant";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The one place the active-tenant cookie is ever written. Never trusts the
 * tenantId it's given — requireOwnerContext() re-establishes who the caller
 * is server-side, then isMemberOfTenant() re-checks real membership before
 * the cookie is set, so this can't be used to select a tenant the caller
 * doesn't actually belong to even if a client sends an arbitrary ID.
 */
export async function setActiveTenantAction(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const isMember = await isMemberOfTenant(ctx.supabase, ctx.ownerId, tenantId);
  if (!isMember) return { ok: false, error: "Not a member of this client" };

  const ensured = await ensureAdminStaffWorkspace(ctx.ownerId, tenantId);
  if (!ensured.ok) return { ok: false, error: ensured.error };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return { ok: true };
}

export async function clearActiveTenantAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
}
