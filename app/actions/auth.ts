"use server";

import { defaultDestination, resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";

/**
 * Where a freshly authenticated user should land. Owner/staff status
 * (a stratxcel_admins row) is the only thing that ever grants /admin —
 * every other authenticated user always goes to /app, whose own layout
 * resolves workspace membership and shows onboarding when there isn't one
 * yet. Workspace membership must never grant internal admin access, so
 * this deliberately checks nothing beyond stratxcel_admins.
 */
export async function resolvePostLoginRedirect(): Promise<"/admin" | "/app"> {
  const identity = await resolveCanonicalIdentity();
  const destination = defaultDestination(identity.state);
  return destination === "/admin" ? "/admin" : "/app";
}
