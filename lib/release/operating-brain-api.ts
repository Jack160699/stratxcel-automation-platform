/**
 * Helpers for owner-session Operating Brain APIs that are exclusively V2
 * control surfaces. Cron/device-bearer routes stay on their own auth.
 */
import { requireReleaseAccessApi } from "./require-release-access.ts";
import type { ReleaseAccessOk } from "./require-release-access.ts";
import { NextResponse } from "next/server";

export async function requireOperatingBrainApiAccess(): Promise<
  { ok: true; ctx: ReleaseAccessOk } | { ok: false; response: NextResponse }
> {
  return requireReleaseAccessApi("v2");
}
