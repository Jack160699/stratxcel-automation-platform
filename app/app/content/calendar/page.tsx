import { requireClientContext } from "@/lib/tenants/client-context";
import { EmptyState } from "@/components/ui/Feedback";
import { StaffScopedNotice } from "../StaffScopedNotice";

function upcomingWeek(): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 86400000));
}

/** Calendar — scheduled content by date. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/planner. */
export default async function ContentCalendarPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const days = upcomingWeek();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Calendar</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Scheduled and upcoming content, by date.</p>
      </header>

      <StaffScopedNotice what="Calendar" accessMode={ctx.accessMode} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex min-h-[100px] flex-col gap-1 rounded-sx-md border border-sx-border bg-sx-surface-1 p-2.5">
            <span className="font-sx-mono text-[10px] uppercase tracking-[0.08em] text-sx-text-subtle">
              {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>

      <EmptyState title="Nothing scheduled." subtitle="Scheduled items will appear on their date once Studio drafts are queued." />
    </div>
  );
}
