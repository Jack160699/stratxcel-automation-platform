import { NextResponse, type NextRequest } from "next/server";
import { listAdminOwnerIds, currentIstDateString } from "@/lib/owner-brain/db-context";
import { autoDraftNightReview } from "@/lib/owner-brain/planner/night-review";

/** Runs at 22:00 IST (16:30 UTC — see vercel.json). Pre-populates a draft review for today for every admin so the review form isn't blank; never overwrites a review the owner already saved. */
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const reviewDate = currentIstDateString();
  const ownerIds = await listAdminOwnerIds();
  const results = await Promise.all(ownerIds.map(async (ownerId) => ({ ownerId, ...(await autoDraftNightReview(ownerId, reviewDate)) })));
  return NextResponse.json({ reviewDate, results });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
