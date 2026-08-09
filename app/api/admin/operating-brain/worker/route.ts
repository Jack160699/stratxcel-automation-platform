import { NextResponse, type NextRequest } from "next/server";
import { runOwnerBrainSyncBatch } from "@/lib/owner-brain/worker";

/** GET/POST /api/admin/operating-brain/worker — same Vercel Cron / CRON_SECRET convention as /api/social/worker. Runs every source's sync connector once per invocation. */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runOwnerBrainSyncBatch();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
