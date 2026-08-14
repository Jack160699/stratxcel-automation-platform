import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMyTenants, type TenantMembership } from "@/lib/tenants/current-tenant";
import { getAgencyTenant, type AgencyTenant } from "@/lib/tenants/admin-repository";
import { readStaffWorkspaceTenantId, readWorkspaceMode } from "./staff-workspace";
import { decideIdentityState, type IdentityState } from "./identity-state";
export { defaultDestination } from "./identity-state";

interface BaseIdentity {
  state: Exclude<IdentityState, "NO_SESSION">;
  userId: string;
  email: string | null;
  profileName: string | null;
  avatarUrl: string | null;
  planPromptSeenTenantIds: string[];
  isStaff: boolean;
  workspaceMode: "customer" | "admin" | null;
  tenants: TenantMembership[];
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export type CanonicalIdentity =
  | { state: "NO_SESSION"; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | (BaseIdentity & { state: "INTERNAL_STAFF" })
  | (BaseIdentity & { state: "CUSTOMER_MEMBER" })
  | (BaseIdentity & { state: "NEW_CUSTOMER" })
  | (BaseIdentity & { state: "STAFF_VIEWING_CLIENT"; staffWorkspace: AgencyTenant });

/** Read-only route surface hint for workspace mode during Server Component render. */
export type RouteSurface = "admin" | "app";

function workspaceModeForRoute(surface: RouteSurface | undefined, cookieMode: "customer" | "admin" | null): "customer" | "admin" | null {
  if (surface === "admin") return "admin";
  // `/app` is both the customer workspace and the destination for an
  // explicitly signed "view client" handoff from `/admin`. Preserve that
  // signed admin intent; otherwise an app visit is customer intent.
  if (surface === "app") return cookieMode ?? "customer";
  return cookieMode;
}

export async function resolveCanonicalIdentity(options?: { routeSurface?: RouteSurface }): Promise<CanonicalIdentity> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { state: "NO_SESSION", supabase };

  const [{ data: adminRow }, tenants] = await Promise.all([
    supabase.from("stratxcel_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    listMyTenants(supabase, user.id),
  ]);
  const isStaff = Boolean(adminRow);
  const cookieWorkspaceMode = await readWorkspaceMode(user.id);
  const workspaceMode = workspaceModeForRoute(options?.routeSurface, cookieWorkspaceMode);
  const requestedTenantId = isStaff ? await readStaffWorkspaceTenantId(user.id) : null;
  const staffWorkspace = requestedTenantId ? await getAgencyTenant(requestedTenantId) : null;
  const state = decideIdentityState({
    hasSession: true,
    isStaff,
    membershipCount: tenants.length,
    hasValidStaffWorkspace: Boolean(staffWorkspace),
    workspaceMode,
  });
  const profileName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim() || null
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name.trim() || null
        : null;
  const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const planPromptSeenTenantIds = Array.isArray(user.user_metadata?.stratxcel_plan_prompt_seen)
    ? user.user_metadata.stratxcel_plan_prompt_seen.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const base = {
    userId: user.id,
    email: user.email ?? null,
    profileName,
    avatarUrl,
    planPromptSeenTenantIds,
    isStaff,
    workspaceMode,
    tenants,
    supabase,
  };
  if (state === "STAFF_VIEWING_CLIENT") return { ...base, state, staffWorkspace: staffWorkspace! };
  return { ...base, state } as CanonicalIdentity;
}
