import { cookies } from "next/headers";
import {
  ADMIN_VIEW_MODE_COOKIE,
  COOKIE_MAX_AGE_SECONDS,
  parseAdminViewMode,
  type AdminViewMode,
} from "./admin-view-mode-pure.ts";

export {
  ADMIN_VIEW_MODE_COOKIE,
  COOKIE_MAX_AGE_SECONDS,
  isAdminViewMode,
  parseAdminViewMode,
  type AdminViewMode,
} from "./admin-view-mode-pure.ts";

/**
 * Server-owned Normal/Technical admin nav preference. Mirrors
 * release-mode.ts's getReleaseMode/setReleaseModeCookie shape exactly.
 *
 * Cookie alone is NOT authorization -- every /admin route is already gated
 * by requireOwnerContext()/resolveCanonicalIdentity() upstream of this. This
 * cookie only records which nav slice an already-authorized staff member
 * asked to see; it never widens what they can reach.
 */

/** Read the current preference. Defaults to normal. Safe for any caller. */
export async function getAdminViewMode(): Promise<AdminViewMode> {
  const cookieStore = await cookies();
  return parseAdminViewMode(cookieStore.get(ADMIN_VIEW_MODE_COOKIE)?.value);
}

export async function isTechnicalModeEnabled(): Promise<boolean> {
  return (await getAdminViewMode()) === "technical";
}

/** Persist preference. Caller MUST already be inside an authorized /admin request. */
export async function setAdminViewModeCookie(mode: AdminViewMode): Promise<void> {
  const cookieStore = await cookies();
  if (mode === "normal") {
    cookieStore.delete(ADMIN_VIEW_MODE_COOKIE);
    return;
  }
  cookieStore.set(ADMIN_VIEW_MODE_COOKIE, "technical", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
