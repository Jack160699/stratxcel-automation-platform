import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgencyTenant } from "@/lib/tenants/admin-repository";
import { isMemberOfTenant } from "@/lib/tenants/current-tenant";
import {
  readStaffWorkspaceTenantId,
  setStaffWorkspaceCookie,
  STAFF_WORKSPACE_COOKIE,
  verifyStaffWorkspaceToken,
} from "./staff-workspace";
import { cookies } from "next/headers";

/**
 * Validates that internal staff may establish a signed workspace for this tenant.
 * Admin shell selection uses membership; agency client entry uses tenant existence.
 */
export async function authorizeAdminStaffWorkspaceTarget(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isMemberOfTenant(supabase, userId, tenantId)) return { ok: true };
  if (await getAgencyTenant(tenantId)) return { ok: true };
  return { ok: false, error: "Tenant not available for staff workspace" };
}

/**
 * Re-issues the signed staff workspace cookie when missing, expired, or out of sync
 * with the explicitly selected admin tenant. Never weakens tenant checks.
 */
export async function ensureAdminStaffWorkspace(
  userId: string,
  tenantId: string
): Promise<{ ok: true; refreshed: boolean } | { ok: false; error: string }> {
  const store = await cookies();
  const token = store.get(STAFF_WORKSPACE_COOKIE)?.value;
  const current = token ? verifyStaffWorkspaceToken(token, userId)?.tenantId ?? null : null;
  if (current === tenantId) return { ok: true, refreshed: false };

  await setStaffWorkspaceCookie(userId, tenantId);
  return { ok: true, refreshed: true };
}

export async function readVerifiedStaffWorkspaceTenantId(userId: string): Promise<string | null> {
  return readStaffWorkspaceTenantId(userId);
}
