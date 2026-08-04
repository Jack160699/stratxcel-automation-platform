import { requireClientContext } from "@/lib/tenants/client-context";
import { Metric } from "@/components/ui/Metric";
import { StaffScopedNotice } from "../StaffScopedNotice";

/** Content Analytics — reach/engagement/publishing performance. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/analytics. */
export default async function ContentAnalyticsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Analytics</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Reach, engagement and publishing performance across channels.</p>
      </header>

      <StaffScopedNotice what="Content analytics" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Posts published" value="—" />
        <Metric label="Reach" value="—" />
        <Metric label="Engagement rate" value="—" />
        <Metric label="Follower growth" value="—" />
      </section>
    </div>
  );
}
