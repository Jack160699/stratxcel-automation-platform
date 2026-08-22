import { requireClientContext } from "@/lib/tenants/client-context";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { StaffScopedNotice } from "../StaffScopedNotice";

/** Automations — rules acting on incoming activity. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalized from app/admin/social/automations. */
export default async function ContentAutomationsPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Automations</h1>
          <p className="mt-1 text-sm text-sx-text-muted">Rules that act on incoming comments, messages and events.</p>
        </div>
        <Button variant="primary" size="sm" disabled>
          New rule
        </Button>
      </header>

      <StaffScopedNotice what="Automations" accessMode={ctx.accessMode} />

      <EmptyState title="No rules yet." subtitle="Rules will list here once this workspace can create them." />
    </div>
  );
}
