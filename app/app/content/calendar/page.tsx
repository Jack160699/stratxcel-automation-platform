import { requireClientContext, type ClientContext } from "@/lib/tenants/client-context";
import { EmptyState } from "@/components/ui/Feedback";
import { StaffScopedNotice } from "../StaffScopedNotice";

function upcomingWeek(): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 86400000));
}

const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", threads: "Threads", linkedin: "LinkedIn" };

interface CalendarItem {
  id: string;
  time: string;
  status: string;
  platform: string | null;
  caption: string;
  imageUrl: string | null;
}

/** Same social_content_variant_media -> social_media_assets join
 * getPackageQueueItemPreview (lib/social/package-preview.ts) and the
 * Pipeline page use -- Package Autopilot content links its real,
 * AI-generated image here, never in content_variants.media_urls (that
 * column is hardcoded empty by prepareNearTermPackageItems). Skipping
 * this join is why a fully-prepared post with a real attached image
 * still rendered as imageless on this page. */
async function resolveQueueThumbnails(
  supabase: ClientContext["supabase"],
  variantIds: string[]
): Promise<Map<string, { url: string; mimeType: string }>> {
  const result = new Map<string, { url: string; mimeType: string }>();
  if (!variantIds.length) return result;
  const { data: links } = await supabase
    .from("social_content_variant_media")
    .select("variant_id, asset_id, position")
    .in("variant_id", variantIds)
    .order("position", { ascending: true });
  if (!links?.length) return result;
  const firstAssetByVariant = new Map<string, string>();
  for (const link of links) {
    if (!firstAssetByVariant.has(link.variant_id as string)) {
      firstAssetByVariant.set(link.variant_id as string, link.asset_id as string);
    }
  }
  const assetIds = [...new Set(firstAssetByVariant.values())];
  const { data: assets } = await supabase
    .from("social_media_assets")
    .select("id, mime_type, storage_bucket, storage_path")
    .eq("status", "READY")
    .in("id", assetIds);
  const assetById = new Map((assets ?? []).map((a) => [a.id as string, a]));
  await Promise.all(
    [...firstAssetByVariant.entries()].map(async ([variantId, assetId]) => {
      const asset = assetById.get(assetId);
      if (!asset) return;
      const { data: signed } = await supabase.storage
        .from(asset.storage_bucket as string)
        .createSignedUrl(asset.storage_path as string, 10 * 60);
      if (signed?.signedUrl) result.set(variantId, { url: signed.signedUrl, mimeType: String(asset.mime_type) });
    })
  );
  return result;
}

/** Calendar — scheduled content by date. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/planner. */
export default async function ContentCalendarPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const days = upcomingWeek();

  // Finalize Autopilot Pipeline mission: real gap found live -- this page
  // was 100% a static 7-day grid with an unconditional "Nothing scheduled."
  // placeholder, regardless of what's actually queued. Wired to the same
  // RLS-safe social_autopilot_queue_items source the Pipeline page and
  // Autopilot dashboard already use.
  const windowEnd = new Date(days[days.length - 1].getTime() + 86_400_000).toISOString();
  const { data: queueRows } = await ctx.supabase
    .from("social_autopilot_queue_items")
    .select("id, scheduled_at, status, variant_id, social_accounts(platform), content_variants(caption)")
    .eq("tenant_id", ctx.workspaceTenant.tenantId)
    .gte("scheduled_at", new Date().toISOString())
    .lt("scheduled_at", windowEnd)
    .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED", "EXECUTING", "PUBLISHED"])
    .order("scheduled_at", { ascending: true });

  const variantIds = [...new Set((queueRows ?? []).map((row) => row.variant_id).filter((id): id is string => Boolean(id)))];
  const thumbnails = await resolveQueueThumbnails(ctx.supabase, variantIds);
  const itemsByDay = new Map<string, CalendarItem[]>(days.map((d) => [d.toDateString(), []]));
  for (const row of queueRows ?? []) {
    const scheduledAt = new Date(row.scheduled_at);
    const bucket = itemsByDay.get(scheduledAt.toDateString());
    if (!bucket) continue; // outside the visible 7-day window
    const platform = (row.social_accounts as { platform?: string } | null)?.platform ?? null;
    bucket.push({
      id: row.id,
      time: scheduledAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      status: row.status,
      platform: platform ? (PLATFORM_LABEL[platform] ?? platform) : null,
      caption: (row.content_variants as { caption?: string } | null)?.caption ?? "",
      imageUrl: row.variant_id ? thumbnails.get(row.variant_id)?.url ?? null : null,
    });
  }
  const hasAnyContent = [...itemsByDay.values()].some((items) => items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Calendar</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Scheduled and upcoming content, by date.</p>
      </header>

      <StaffScopedNotice what="Calendar" accessMode={ctx.accessMode} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((d) => {
          const items = itemsByDay.get(d.toDateString()) ?? [];
          return (
            <div key={d.toISOString()} className="flex min-h-[100px] flex-col gap-1.5 rounded-sx-md border border-sx-border bg-sx-surface-1 p-2.5">
              <span className="font-sx-mono text-[10px] uppercase tracking-[0.08em] text-sx-text-subtle">
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </span>
              {items.map((item) => (
                <div key={item.id} className="rounded-sx-xs border border-sx-border bg-sx-surface-2 p-1.5 text-[11px]">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth Next/Image's remote-pattern config for a 10-minute link
                    <img src={item.imageUrl} alt="" className="mb-1 aspect-square w-full rounded-sx-xs object-cover" />
                  )}
                  <p className="font-semibold text-sx-text">{item.time}{item.platform ? ` · ${item.platform}` : ""}</p>
                  {item.caption && <p className="mt-0.5 truncate text-sx-text-muted">{item.caption}</p>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {!hasAnyContent && (
        <EmptyState title="Nothing scheduled." subtitle="Scheduled items will appear on their date once Studio drafts are queued." />
      )}
    </div>
  );
}
