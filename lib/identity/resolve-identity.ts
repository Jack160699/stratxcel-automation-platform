import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMyTenants, type TenantMembership } from "@/lib/tenants/current-tenant";
import { getAgencyTenant, type AgencyTenant } from "@/lib/tenants/admin-repository";
import { readStaffWorkspaceTenantId } from "./staff-workspace";
import { decideIdentityState, type IdentityState } from "./identity-state";
export { defaultDestination } from "./identity-state";

interface BaseIdentity {
  state: Exclude<IdentityState, "NO_SESSION">;
  userId: string;
  email: string | null;
  tenants: TenantMembership[];
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export type CanonicalIdentity =
  | { state: "NO_SESSION"; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | (BaseIdentity & { state: "INTERNAL_STAFF" })
  | (BaseIdentity & { state: "CUSTOMER_MEMBER" })
  | (BaseIdentity & { state: "NEW_CUSTOMER" })
  | (BaseIdentity & { state: "STAFF_VIEWING_CLIENT"; staffWorkspace: AgencyTenant });

export async function resolveCanonicalIdentity(): Promise<CanonicalIdentity> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { state: "NO_SESSION", supabase };

  const [{ data: adminRow }, tenants] = await Promise.all([
    supabase.from("stratxcel_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    listMyTenants(supabase, user.id),
  ]);
  const isStaff = Boolean(adminRow);
  const requestedTenantId = isStaff ? await readStaffWorkspaceTenantId(user.id) : null;
  const staffWorkspace = requestedTenantId ? await getAgencyTenant(requestedTenantId) : null;
  const state = decideIdentityState({
    hasSession: true,
    isStaff,
    membershipCount: tenants.length,
    hasValidStaffWorkspace: Boolean(staffWorkspace),
  });
  const base = { userId: user.id, email: user.email ?? null, tenants, supabase };
  if (state === "STAFF_VIEWING_CLIENT") return { ...base, state, staffWorkspace: staffWorkspace! };
  return { ...base, state } as CanonicalIdentity;
}
