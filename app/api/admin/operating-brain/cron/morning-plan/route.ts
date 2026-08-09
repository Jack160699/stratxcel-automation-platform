import { NextResponse, type NextRequest } from "next/server";
import { listAdminOwnerIds, currentIstDateString } from "@/lib/owner-brain/db-context";
import { generateAndSaveMorningPlan } from "@/lib/owner-brain/planner/morning-plan";

/** Runs at 08:30 IST (03:00 UTC — see vercel.json). Deterministic rules-based plan by default (see lib/owner-brain/hermes/morning-plan-hermes.ts for why Hermes isn't wired here yet). */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const planDate = currentIstDateString();
  const ownerIds = await listAdminOwnerIds();
  const results = await Promise.all(ownerIds.map(async (ownerId) => ({ ownerId, planId: await generateAndSaveMorningPlan(ownerId, planDate, "rules") })));
  return NextResponse.json({ planDate, results });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
