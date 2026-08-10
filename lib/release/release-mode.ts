import { cookies } from "next/headers";
import {
  COOKIE_MAX_AGE_SECONDS,
  parseReleaseMode,
  RELEASE_MODE_COOKIE,
  type ReleaseMode,
} from "./release-mode-pure.ts";

export {
  COOKIE_MAX_AGE_SECONDS,
  isReleaseMode,
  parseReleaseMode,
  RELEASE_MODE_COOKIE,
  type ReleaseMode,
} from "./release-mode-pure.ts";

/**
 * Server-owned release-mode preference for owner-admins.
 *
 * Cookie alone is NOT authorization — every V2 request must still pass
 * requireOwnerContext() (or equivalent). This cookie only records whether
 * an already-authorized owner-admin asked to see Beta surfaces.
 */

/** Read the current preference. Defaults to stable. Safe for any caller. */
export async function getReleaseMode(): Promise<ReleaseMode> {
  const cookieStore = await cookies();
  return parseReleaseMode(cookieStore.get(RELEASE_MODE_COOKIE)?.value);
}

export async function isBetaModeEnabled(): Promise<boolean> {
  return (await getReleaseMode()) === "beta";
}

/** Persist preference. Caller MUST have already authorized owner-admin. */
export async function setReleaseModeCookie(mode: ReleaseMode): Promise<void> {
  const cookieStore = await cookies();
  if (mode === "stable") {
    cookieStore.delete(RELEASE_MODE_COOKIE);
    return;
  }
  cookieStore.set(RELEASE_MODE_COOKIE, "beta", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
