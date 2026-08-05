import { requireClientContext } from "@/lib/tenants/client-context";
import { EmptyState } from "@/components/ui/Feedback";
import { StaffScopedNotice } from "../StaffScopedNotice";

/** Content Inbox — comments/messages across connected channels. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/inbox. */
export default async function ContentInboxPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Inbox</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Comments and messages across connected channels.</p>
      </header>

      <StaffScopedNotice what="Content Inbox" />

      <div className="flex flex-wrap gap-2">
        {["All", "Unread", "Instagram", "Facebook", "Threads", "YouTube"].map((f) => (
          <span key={f} className="rounded-sx-xs border border-sx-border-strong px-2.5 py-1 text-[11px] text-sx-text-muted">
            {f}
          </span>
        ))}
      </div>

      <EmptyState title="No messages." subtitle="Comments and DMs from connected channels will land here." />
    </div>
  );
}
