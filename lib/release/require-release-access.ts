import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwnerContext, type OwnerContext, type OwnerContextError } from "@/lib/social/db-context";
import { isBetaModeEnabled } from "./release-mode.ts";
import type { ProductRelease } from "./product-release.ts";

export type ReleaseAccessOk = OwnerContext & { betaEnabled: boolean };
export type ReleaseAccessDenied = OwnerContextError | { ok: false; status: 403; error: string; reason: "beta_required" };

/**
 * Owner-admin + Beta Mode both required for V2 surfaces.
 * Does not replace underlying permissions — callers still apply their own
 * tenant / staff / entitlement checks after this returns ok.
 */
export async function requireOwnerBetaContext(): Promise<ReleaseAccessOk | ReleaseAccessDenied> {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return ctx;

  const betaEnabled = await isBetaModeEnabled();
  if (!betaEnabled) {
    return { ok: false, status: 403, error: "Beta mode required", reason: "beta_required" };
  }

  return { ...ctx, betaEnabled: true };
}

/**
 * Page-level guard. Stable/non-beta callers are redirected to a safe V1
 * parent before any V2 data is fetched.
 */
export async function requireReleaseAccess(
  release: ProductRelease,
  opts?: { redirectTo?: string }
): Promise<ReleaseAccessOk> {
  if (release === "v1") {
    const ctx = await requireOwnerContext();
    if (!ctx.ok) {
      if (ctx.status === 401) redirect("/login");
      notFound();
    }
    const betaEnabled = await isBetaModeEnabled();
    return { ...ctx, betaEnabled };
  }

  const access = await requireOwnerBetaContext();
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    redirect(opts?.redirectTo ?? "/admin");
  }
  return access;
}

/** API-level guard — returns a JSON Response on denial, never throws. */
export async function requireReleaseAccessApi(
  release: ProductRelease
): Promise<{ ok: true; ctx: ReleaseAccessOk } | { ok: false; response: NextResponse }> {
  if (release === "v1") {
    const ctx = await requireOwnerContext();
    if (!ctx.ok) {
      return {
        ok: false,
        response: NextResponse.json({ error: ctx.error }, { status: ctx.status }),
      };
    }
    const betaEnabled = await isBetaModeEnabled();
    return { ok: true, ctx: { ...ctx, betaEnabled } };
  }

  const access = await requireOwnerBetaContext();
  if (!access.ok) {
    const status = access.status === 401 ? 401 : 403;
    return {
      ok: false,
      response: NextResponse.json(
        { error: "reason" in access && access.reason === "beta_required" ? "Beta mode required" : access.error },
        { status }
      ),
    };
  }
  return { ok: true, ctx: access };
}
