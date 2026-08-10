import Link from "next/link";
import { requireClientContext } from "@/lib/tenants/client-context";
import { Card, CardHeading } from "@/components/ui/Card";
import { StaffScopedNotice } from "./StaffScopedNotice";

const SECTIONS: { title: string; description: string; href: string }[] = [
  { title: "Studio", description: "Draft and edit posts and campaigns.", href: "/app/content/studio" },
  { title: "Calendar", description: "Scheduled and upcoming content by date.", href: "/app/content/calendar" },
  { title: "Pipeline", description: "Drafts, awaiting approval, scheduled, published.", href: "/app/content/pipeline" },
  { title: "Inbox", description: "Comments and messages across connected channels.", href: "/app/content/inbox" },
  { title: "Analytics", description: "Reach, engagement and publishing performance.", href: "/app/content/analytics" },
  { title: "Automations", description: "Rules that act on incoming activity.", href: "/app/content/automations" },
];

/**
 * Content Overview — the /app generalization of Social Autopilot's Command
 * Center. Real page structure per PAGE_BY_PAGE_SPECIFICATIONS.md's Content
 * cluster; data stays honest (StaffScopedNotice) because the underlying
 * social_* tables are owner-scoped, not tenant-scoped — see
 * CURRENT_TO_FINAL_MIGRATION_PLAN.md §3a.
 */
export default async function ContentPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Content & Media</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Studio, calendar, pipeline, and channels for this workspace.</p>
      </header>

      <StaffScopedNotice what="Content" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-sx-text-muted">Current mission</p>
          <p className="mt-1 text-sm text-sx-text">—</p>
        </Card>
        <Card>
          <p className="text-xs text-sx-text-muted">Upcoming scheduled</p>
          <p className="mt-1 text-sm text-sx-text">—</p>
        </Card>
        <Card>
          <p className="text-xs text-sx-text-muted">Drafts awaiting approval</p>
          <p className="mt-1 text-sm text-sx-text">—</p>
        </Card>
        <Card>
          <p className="text-xs text-sx-text-muted">Connected channels</p>
          <p className="mt-1 text-sm text-sx-text">—</p>
        </Card>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 transition-colors hover:border-sx-border-strong">
            <CardHeading>{s.title}</CardHeading>
            <p className="mt-1 text-xs text-sx-text-subtle">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
