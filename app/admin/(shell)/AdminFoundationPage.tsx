import { EmptyState } from "@/components/ui/Feedback";

/**
 * Admin's counterpart to app/app/FoundationPage.tsx — for the agency-wide
 * pages in ADMIN_INFORMATION_ARCHITECTURE.md §1 that have no current
 * equivalent (Human Handoffs, Team, Audit Log). Same discipline: real page
 * structure, honest "not built yet" state, never fabricated rows.
 */
export function AdminFoundationPage({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">{title}</h1>
      </header>
      <EmptyState title="Not yet built" subtitle={note} />
    </div>
  );
}
