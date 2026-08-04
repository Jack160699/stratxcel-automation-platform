"use server";

import { requireOwnerContext } from "@/lib/social/db-context";

/**
 * Where a freshly authenticated user should land. Owner/staff status
 * (a stratxcel_admins row) is the only thing that ever grants /admin —
 * every other authenticated user always goes to /app, whose own layout
 * resolves workspace membership and shows onboarding when there isn't one
 * yet. Workspace membership must never grant internal admin access, so
 * this deliberately checks nothing beyond stratxcel_admins.
 */
export async function resolvePostLoginRedirect(): Promise<"/admin" | "/app"> {
  const ctx = await requireOwnerContext();
  return ctx.ok ? "/admin" : "/app";
}
