import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifies a user actually belongs to the given tenant.
 *
 * Extracted from the OAuth callback route (app/api/social/oauth/[provider]/
 * callback/route.ts) after a real, reproducible production failure: that
 * inline query selected "id" from tenant_members, a table whose primary key
 * is the composite (tenant_id, user_id) with no separate id column (see
 * 20260803120000_platform_tenants_rbac_audit.sql). Every call errored with
 * "column tenant_members.id does not exist", and the destructured
 * `{ data }` silently discarded the error -- so this always returned false
 * for a real, correctly-provisioned owner, wiping the resolved tenantId and
 * failing every reconnect from an existing workspace (any provider, any
 * tenant) with a generic "missing_tenant" error. A standalone, testable
 * function makes this exact class of "selected a column that doesn't
 * exist" bug something a unit test actually exercises, instead of only
 * being visible against the real, live schema.
 */
export async function isTenantMember(
  service: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await service
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("isTenantMember: membership query failed", { tenantId, userId, error: error.message });
    return false;
  }

  return Boolean(data);
}
