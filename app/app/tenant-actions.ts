"use server";

import { cookies } from "next/headers";
import { requireClientContext } from "@/lib/tenants/client-context";
import { ACTIVE_TENANT_COOKIE, isMemberOfTenant } from "@/lib/tenants/current-tenant";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The /app equivalent of app/admin/(shell)/tenant-actions.ts — same
 * membership-verified-before-write cookie logic, gated by
 * requireClientContext() (any authenticated user) instead of
 * requireOwnerContext() (staff only). Shares the exact cookie name and
 * isMemberOfTenant() check, so a person who is both staff and a tenant
 * member gets one consistent active-tenant selection regardless of which
 * shell set it.
 */
export async function setActiveTenantAction(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireClientContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (ctx.staffWorkspaceTenantId) return { ok: false, error: "Return to Admin before changing clients" };

  const isMember = await isMemberOfTenant(ctx.supabase, ctx.userId, tenantId);
  if (!isMember) return { ok: false, error: "Not a member of this client" };

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
