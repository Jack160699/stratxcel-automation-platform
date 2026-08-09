import { NextResponse } from "next/server";
import { completeDevicePairing } from "@/lib/owner-brain/repositories/desktop-devices";

/**
 * POST /api/admin/operating-brain/devices/pair
 * Body: { deviceId: string; pairingCode: string }
 * Called by the desktop companion (owner-brain-companion), NOT by an
 * authenticated browser session — the one-time pairing code (shown once
 * in the admin UI after createPendingDevice) is the credential here. On
 * success returns the bearer token exactly once; the companion must
 * store it locally and never has another way to retrieve it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { deviceId?: string; pairingCode?: string } | null;
  if (!body?.deviceId || !body?.pairingCode) {
    return NextResponse.json({ error: "deviceId and pairingCode are required" }, { status: 400 });
  }

  const result = await completeDevicePairing({ deviceId: body.deviceId, pairingCode: body.pairingCode });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  return NextResponse.json({ bearerToken: result.bearerToken });
}

export const dynamic = "force-dynamic";
