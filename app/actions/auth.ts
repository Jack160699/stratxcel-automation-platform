"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultDestination, resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import {
  commitWorkspaceIntent,
  setPendingWorkspaceMode,
  setWorkspaceModeCookie,
  type WorkspaceMode,
} from "@/lib/identity/staff-workspace";
import { parseWorkspaceModeParam } from "@/lib/auth/redirect";

export async function establishPendingWorkspaceIntent(mode: WorkspaceMode): Promise<void> {
  await setPendingWorkspaceMode(mode);
}

export async function finalizeAuthWorkspaceIntent(explicitMode?: string | null): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  await commitWorkspaceIntent({
    subject: user.id,
    isStaff: Boolean(adminRow),
    explicitMode: parseWorkspaceModeParam(explicitMode),
  });
}

/** Direct /app entry: dual-role staff with membership may use customer workspace. */
export async function ensureCustomerWorkspaceForAppEntry(userId: string, hasMembership: boolean): Promise<void> {
  if (!hasMembership) return;
  await setWorkspaceModeCookie(userId, "customer");
}

/** Direct /admin entry: staff surface always uses admin workspace mode. */
export async function ensureAdminWorkspaceForAdminEntry(userId: string): Promise<void> {
  await setWorkspaceModeCookie(userId, "admin");
}

/**
 * Where a freshly authenticated user should land. Staff/admin status
 * (a stratxcel_admins row) grants /admin only when workspace mode is admin.
 * Customer intent always routes to /app or a safe customer next URL.
 */
export async function resolvePostLoginRedirect(): Promise<"/admin" | "/app"> {
  const identity = await resolveCanonicalIdentity();
  const destination = defaultDestination(identity.state);
  return destination === "/admin" ? "/admin" : "/app";
}
