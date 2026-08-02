import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseServiceClient } from "../supabase/service";
import type { TenantRole } from "./types";

/**
 * Tenant-scoped equivalent of lib/social/db-context.ts's OwnerContext, for
 * the new multi-tenant platform modules (missions, brand brain, wallet,
 * approvals, human handoff). Every server-side read/write for those
 * modules must go through requireTenantContext so tenant_id is never taken
 * from an untrusted client-supplied value — it's re-derived from the
 * caller's session + tenant_members row on every call.
 */
export interface TenantContext {
  ok: true;
  tenantId: string;
  userId: string;
  role: TenantRole;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export interface TenantContextError {
  ok: false;
  status: 401 | 403;
  error: string;
}

export async function requireTenantContext(
  tenantId: string
): Promise<TenantContext | TenantContextError> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const { data: memberRow } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRow) return { ok: false, status: 403, error: "Not a member of this tenant" };

  return { ok: true, tenantId, userId: user.id, role: memberRow.role as TenantRole, supabase };
}

export function getTenantServiceContext() {
  return { supabase: createSupabaseServiceClient() };
}
