import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/owner-brain/repositories/desktop-devices";
import { getServiceContext } from "@/lib/owner-brain/db-context";
import { ingestEvent } from "@/lib/owner-brain/repositories/events";
import { getSourceByKey, ensureSourceRows } from "@/lib/owner-brain/repositories/sources";

interface DesktopSignal {
  id: string; // client-generated idempotency key
  type: "app_session" | "manual_note";
  occurredAt: string;
  /** Bounded, owner-approved fields only — see the desktop companion's own consent gating (desktop-companion/src/consent.ts) which decides what's even collected before this ever gets sent. */
  appName?: string;
  windowTitle?: string;
  durationSeconds?: number;
  note?: string;
}

/**
 * POST /api/admin/operating-brain/devices/ingest
 * Authorization: Bearer <device token>. No owner cookie session involved
 * — this is a machine-to-machine endpoint, deliberately separate from
 * every requireOwnerContext()-gated route in this feature so a stolen
 * browser cookie can never touch this and a stolen device token can never
 * reach the owner-session-gated admin routes.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  const device = await authenticateDevice(token);
  if (!device) return NextResponse.json({ error: "Invalid or revoked device token" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { signals?: DesktopSignal[] } | null;
  if (!body?.signals?.length) return NextResponse.json({ error: "signals array is required" }, { status: 400 });
  if (body.signals.length > 200) return NextResponse.json({ error: "Too many signals in one batch (max 200)" }, { status: 413 });

  const service = getServiceContext().supabase;
  const ctxLike = { ownerId: device.ownerId, supabase: service };
  await ensureSourceRows(ctxLike);
  const source = await getSourceByKey(ctxLike, "desktop_companion");
  if (!source || source.status === "PAUSED") {
    return NextResponse.json({ error: "desktop_companion source is disabled or paused — signals dropped" }, { status: 403 });
  }

  let ingested = 0;
  for (const signal of body.signals) {
    const { inserted } = await ingestEvent({
      ownerId: device.ownerId,
      sourceId: source.id,
      externalId: `${device.deviceId}:${signal.id}`,
      eventType: signal.type === "app_session" ? "desktop_app_session" : "voice_note",
      occurredAt: signal.occurredAt,
      payload:
        signal.type === "app_session"
          ? { appName: signal.appName, windowTitleLength: signal.windowTitle?.length ?? 0, durationSeconds: signal.durationSeconds }
          : { noteLength: signal.note?.length ?? 0 },
    });
    if (inserted) ingested += 1;
  }

  return NextResponse.json({ ingested });
}

export const dynamic = "force-dynamic";
