import "server-only";

import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { AgencyTenant } from "@/lib/tenants/admin-repository";
import type { TenantMembership } from "@/lib/tenants/current-tenant";

/**
 * Canonical /app authorization gate. Customer members use their tenant
 * membership; staff must first establish a short-lived, signed workspace
 * context for a tenant they can access. Staff status alone never grants
 * direct client-app access.
 */
export interface CustomerClientContext {
  ok: true;
  accessMode: "customer";
  userId: string;
  email: string | null;
  supabase: Awaited<ReturnType<typeof resolveCanonicalIdentity>>["supabase"];
  workspaceTenant: TenantMembership;
  staffWorkspaceTenantId: null;
}

export interface StaffSupportClientContext {
  ok: true;
  accessMode: "staff_support";
  userId: string;
  email: string | null;
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  workspaceTenant: AgencyTenant;
  staffWorkspaceTenantId: string;
}

export type ClientContext = CustomerClientContext | StaffSupportClientContext;

export interface ClientContextError {
  ok: false;
  status: 401 | 403;
  error: string;
}

export async function requireClientContext(): Promise<ClientContext | ClientContextError> {
  const identity = await resolveCanonicalIdentity({ routeSurface: "app" });
  if (identity.state === "NO_SESSION") return { ok: false, status: 401, error: "Not authenticated" };
  if (identity.state === "INTERNAL_STAFF") return { ok: false, status: 403, error: "Staff workspace context required" };
  if (identity.state === "NEW_CUSTOMER") return { ok: false, status: 403, error: "Customer workspace membership required" };
  if (identity.state === "STAFF_VIEWING_CLIENT") {
    return {
      ok: true,
      accessMode: "staff_support",
      userId: identity.userId,
      email: identity.email,
      supabase: createSupabaseServiceClient(),
      workspaceTenant: identity.staffWorkspace,
      staffWorkspaceTenantId: identity.staffWorkspace.tenantId,
    };
  }
  return {
    ok: true,
    accessMode: "customer",
    userId: identity.userId,
    email: identity.email,
    supabase: identity.supabase,
    workspaceTenant: identity.tenants[0],
    staffWorkspaceTenantId: null,
  };
}
