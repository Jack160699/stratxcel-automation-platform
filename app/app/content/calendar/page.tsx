import { requireClientContext } from "@/lib/tenants/client-context";
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
    .select("id, scheduled_at, status, social_accounts(platform), content_variants(caption)")
    .eq("tenant_id", ctx.workspaceTenant.tenantId)
    .gte("scheduled_at", new Date().toISOString())
    .lt("scheduled_at", windowEnd)
    .in("status", ["PLANNED", "PREPARED", "REVIEW_REQUIRED", "SCHEDULED", "EXECUTING", "PUBLISHED"])
    .order("scheduled_at", { ascending: true });

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
