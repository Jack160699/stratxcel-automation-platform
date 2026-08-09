import { getServiceContext } from "../db-context";
import { upsertDailyReviewForOwner, getDailyReviewForOwner } from "../repositories/reviews-plans";
import { listOpenLoopsForOwner } from "../repositories/open-loops";

/**
 * Runs at 22:00 IST (see vercel.json cron + app/api/admin/operating-brain/
 * cron/night-review/route.ts). Does NOT fabricate the owner's own
 * reflection (done/problems/decisions/mood are the owner's words, entered
 * via the UI form) — it only pre-populates the objective parts (today's
 * event count, open loops) into a draft row with source='auto_prompted'
 * so the review form isn't blank, then leaves the subjective fields for
 * the owner to fill. If a review already exists for today (the owner
 * already saved one manually), this is a safe no-op.
 */
export async function autoDraftNightReview(ownerId: string, reviewDate: string): Promise<{ created: boolean }> {
  const service = getServiceContext().supabase;

  const existing = await getDailyReviewForOwner(service, ownerId, reviewDate);
  if (existing) return { created: false };

  const openLoops = await listOpenLoopsForOwner(service, ownerId, "OPEN");
  const dayStart = `${reviewDate}T00:00:00.000Z`;
  const dayEnd = `${reviewDate}T23:59:59.999Z`;
  const { count } = await service
    .from("owner_events")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("occurred_at", dayStart)
    .lte("occurred_at", dayEnd);

  await upsertDailyReviewForOwner(ownerId, {
    reviewDate,
    done: count ? `${count} tracked events today across connected sources — fill in what actually got done.` : undefined,
    openLoops: openLoops.slice(0, 10).map((l) => ({ item: l.item, dueDate: l.due_date })),
    source: "auto_prompted",
  });

  return { created: true };
}
