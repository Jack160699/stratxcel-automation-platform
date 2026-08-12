import { requireOwnerContext } from "@/lib/social/db-context";
import {
  authorizeAdminStaffWorkspaceTarget,
  ensureAdminStaffWorkspace,
} from "@/lib/identity/admin-staff-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe client-triggered recovery when the short-lived staff workspace token
 * expired or drifted from the UI-selected admin tenant. Re-validates staff
 * identity and tenant authority server-side before re-issuing the cookie.
 */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
  const tenantId = body?.tenantId?.trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const authorized = await authorizeAdminStaffWorkspaceTarget(ctx.supabase, ctx.ownerId, tenantId);
  if (!authorized.ok) return Response.json({ error: authorized.error }, { status: 403 });

  const ensured = await ensureAdminStaffWorkspace(ctx.ownerId, tenantId);
  if (!ensured.ok) return Response.json({ error: ensured.error }, { status: 403 });

  return Response.json({ ok: true, refreshed: ensured.refreshed }, { headers: { "Cache-Control": "no-store" } });
}
