import { NextResponse, type NextRequest } from "next/server";
import { runOwnerBrainRetentionCleanup } from "@/lib/owner-brain/worker";

/** Daily. Deletes owner_events past each source's own retention_days and owner_memories past their expires_at — never deletes CONFIRMED durable memories, only expired TEMPORARY_CONTEXT-style ones and aged raw events. */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runOwnerBrainRetentionCleanup();
  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
