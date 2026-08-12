import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseServiceClient } from "../supabase/service";
import { readStaffWorkspaceTenantId } from "../identity/staff-workspace";
import { STAFF_WORKSPACE_CONTEXT_ERROR } from "../identity/staff-workspace-errors";
import { getAgencyTenant, type AgencyTenant } from "./admin-repository";
import type { TenantRole } from "./types";
import type { Permission } from "../rbac/types";
import { requirePermission } from "../rbac/policy";

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
  accessMode: "customer";
  tenantId: string;
  userId: string;
  role: TenantRole;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export interface StaffSupportTenantContext {
  ok: true;
  accessMode: "staff_support";
  tenantId: string;
  userId: string;
  role: null;
  tenant: AgencyTenant;
  supabase: ReturnType<typeof createSupabaseServiceClient>;
}

export type TenantReadContext = TenantContext | StaffSupportTenantContext;

/** Staff support is authorized to read; customer reads retain role policy. */
export function requireTenantReadPermission(ctx: TenantReadContext, permission: Permission): void {
  if (ctx.accessMode === "customer") requirePermission(ctx.role, permission);
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

  return { ok: true, accessMode: "customer", tenantId, userId: user.id, role: memberRow.role as TenantRole, supabase };
}

/**
 * Read-only tenant gate for the client workspace. Customer requests retain
 * the normal tenant_members + RLS path. Internal staff may read only when
 * their signed, short-lived workspace token names this exact existing tenant.
 * Mutation routes must continue to use requireTenantContext.
 */
export async function requireTenantReadContext(
  tenantId: string
): Promise<TenantReadContext | TenantContextError> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const { data: staffRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffRow) {
    const workspaceTenantId = await readStaffWorkspaceTenantId(user.id);
    if (workspaceTenantId !== tenantId) {
      return { ok: false, status: 403, error: STAFF_WORKSPACE_CONTEXT_ERROR };
    }
    const tenant = await getAgencyTenant(tenantId);
    if (!tenant) return { ok: false, status: 403, error: "Staff workspace tenant does not exist" };
    return {
      ok: true,
      accessMode: "staff_support",
      tenantId,
      userId: user.id,
      role: null,
      tenant,
      supabase: createSupabaseServiceClient(),
    };
  }

  const { data: memberRow } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!memberRow) return { ok: false, status: 403, error: "Not a member of this tenant" };

  return {
    ok: true,
    accessMode: "customer",
    tenantId,
    userId: user.id,
    role: memberRow.role as TenantRole,
    supabase,
  };
}

export function getTenantServiceContext() {
  return { supabase: createSupabaseServiceClient() };
}
