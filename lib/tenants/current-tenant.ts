import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listMembershipsForUser } from "./repository";
import type { TenantRole } from "./types";

export const ACTIVE_TENANT_COOKIE = "stratxcel_active_tenant";

export interface TenantMembership {
  tenantId: string;
  name: string;
  slug: string;
  role: TenantRole;
}

/**
 * Ordinary tenant-membership resolution is a user-initiated read of the
 * caller's own data, fully covered by tenant_members_self_read /
 * tenants_member_read RLS (see supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql)
 * — it must run through the authenticated, request-bound client the
 * caller already has (requireOwnerContext()'s ctx.supabase), never a
 * service-role client created here. This file intentionally has no
 * dependency on SUPABASE_SERVICE_ROLE_KEY at all.
 */
export async function listMyTenants(supabase: SupabaseClient, userId: string): Promise<TenantMembership[]> {
  const memberships = await listMembershipsForUser(supabase, userId);
  return memberships.map((m) => ({
    tenantId: m.tenant_id,
    name: m.tenant.name,
    slug: m.tenant.slug,
    role: m.role,
  }));
}

export interface CurrentTenantResult {
  tenants: TenantMembership[];
  active: TenantMembership | null;
}

/**
 * Resolves the "current" client for this request. The selection cookie is
 * only ever a UX hint — it is always re-checked against a fresh membership
 * list before being trusted, so a stale, forged, or since-removed cookie
 * value can never select a tenant the caller no longer (or never did)
 * belong to. Falls back to the first accessible tenant when the cookie is
 * missing or invalid, and returns active: null when the user has zero
 * memberships (first-run state, surfaced by the Command Center as
 * onboarding rather than an empty dashboard).
 */
export async function resolveCurrentTenant(supabase: SupabaseClient, userId: string): Promise<CurrentTenantResult> {
  const tenants = await listMyTenants(supabase, userId);
  if (tenants.length === 0) return { tenants, active: null };

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const matched = selectedId ? tenants.find((t) => t.tenantId === selectedId) : undefined;

  return { tenants, active: matched ?? tenants[0] };
}

/**
 * Membership check used by the server action that actually sets the
 * cookie (see app/admin/(shell)/tenant-actions.ts) — kept here so the one
 * "is this user really a member of this tenant" query lives next to the
 * rest of the tenant-resolution logic rather than being re-implemented at
 * the call site.
 */
export async function isMemberOfTenant(supabase: SupabaseClient, userId: string, tenantId: string): Promise<boolean> {
  const memberships = await listMyTenants(supabase, userId);
  return memberships.some((m) => m.tenantId === tenantId);
}
