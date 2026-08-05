import { requireClientContext } from "@/lib/tenants/client-context";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { StaffScopedNotice } from "../StaffScopedNotice";

/** Studio — draft composer + drafts list. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/create. */
export default async function ContentStudioPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Studio</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Draft and edit posts and campaigns before they enter the pipeline.</p>
      </header>

      <StaffScopedNotice what="Studio" />

      <Card>
        <CardHeading>New draft</CardHeading>
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            disabled
            rows={4}
            placeholder="Caption / copy…"
            className="w-full resize-none rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-sm text-sx-text-muted placeholder:text-sx-text-subtle disabled:cursor-not-allowed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled>
              Attach media
            </Button>
            <Button variant="secondary" size="sm" disabled>
              Choose channel
            </Button>
            <Button variant="primary" size="sm" disabled className="ml-auto">
              Save draft
            </Button>
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Drafts</h2>
        <EmptyState title="No drafts yet." />
      </section>
    </div>
  );
}
