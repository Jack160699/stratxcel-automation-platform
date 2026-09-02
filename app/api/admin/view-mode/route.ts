import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { isAdminViewMode, setAdminViewModeCookie, type AdminViewMode } from "@/lib/release/admin-view-mode";
import { recordAudit } from "@/lib/social/repositories/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/view-mode
 * Body: { mode: "normal" | "technical" }
 *
 * Owner-admin only, same gate as /api/admin/release-mode. Switches which
 * nav slice (business-facing vs engineering/system) this staff member sees
 * -- never changes what they're authorized to reach; every route under
 * either slice is independently gated regardless of this preference.
 */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = (body as { mode?: unknown })?.mode;
  if (!isAdminViewMode(mode)) {
    return NextResponse.json({ error: "mode must be normal or technical" }, { status: 400 });
  }

  await setAdminViewModeCookie(mode as AdminViewMode);

  const action =
    mode === "technical" ? "admin.view_mode.technical_enabled" : "admin.view_mode.normal_enabled";

  try {
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action,
      targetType: "admin_view_mode",
      targetId: mode,
      summary: mode === "technical" ? "Owner-admin switched to Technical Admin" : "Owner-admin returned to Normal Admin",
      meta: { email: ctx.email },
    });
  } catch {
    // Audit must never block the preference write.
  }

  revalidatePath("/admin", "layout");

  return NextResponse.json(
    { ok: true, mode },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

export async function GET() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const { getAdminViewMode } = await import("@/lib/release/admin-view-mode");
  const mode = await getAdminViewMode();
  return NextResponse.json(
    { mode },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }
  );
}
