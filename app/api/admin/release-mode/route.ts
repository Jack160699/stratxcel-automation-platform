import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { isReleaseMode, setReleaseModeCookie, type ReleaseMode } from "@/lib/release/release-mode";
import { recordAudit } from "@/lib/social/repositories/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/release-mode
 * Body: { mode: "stable" | "beta" }
 *
 * Owner-admin only. Ordinary tenant/customer identity cannot enable Beta.
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
  if (!isReleaseMode(mode)) {
    return NextResponse.json({ error: "mode must be stable or beta" }, { status: 400 });
  }

  await setReleaseModeCookie(mode as ReleaseMode);

  const action =
    mode === "beta" ? "admin.release_mode.beta_enabled" : "admin.release_mode.stable_enabled";

  try {
    await recordAudit({
      actorType: "USER",
      actorId: ctx.ownerId,
      action,
      targetType: "release_mode",
      targetId: mode,
      summary: mode === "beta" ? "Owner-admin enabled Beta mode" : "Owner-admin returned to Stable mode",
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
  const { getReleaseMode } = await import("@/lib/release/release-mode");
  const mode = await getReleaseMode();
  return NextResponse.json(
    { mode },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }
  );
}
