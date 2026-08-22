import Link from "next/link";
import { Card } from "@/components/ui/Card";

/**
 * Social Autopilot's tables (social_accounts, social_content_*, etc. —
 * supabase/migrations/20260727210513_social_autopilot_schema_delta.sql and
 * related) are owner_id-scoped with RLS requiring a stratxcel_admins row
 * (`exists (select 1 from stratxcel_admins ...)`). A client /app session is
 * never a stratxcel_admins row, so this isn't a missing feature flag — RLS
 * structurally returns nothing for a client session no matter what UI calls
 * it. Showing real rows here would either fail outright or require a
 * tenant_id migration + policy rewrite, both explicitly out of scope for
 * this pass (CURRENT_TO_FINAL_MIGRATION_PLAN.md §3a).
 *
 * The internal detail (data model, migration plan reference, the
 * staff-only /admin/social deep link) is for a staff session viewing a
 * client's workspace in support mode — a normal customer session must
 * never see engineering language or a link into an admin route they can't
 * reach. `accessMode` selects which of those two honest states to render.
 */
export function StaffScopedNotice({ what, accessMode }: { what: string; accessMode?: "customer" | "staff_support" }) {
  if (accessMode === "staff_support") {
    return (
      <Card variant="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sx-text">{what} is staff-managed today, not yet per-client.</p>
          <p className="mt-1 text-xs text-sx-text-muted">
            Its data model isn&apos;t tenant-scoped yet — see CURRENT_TO_FINAL_MIGRATION_PLAN.md §3a for the schema work this needs.
          </p>
        </div>
        <Link href="/admin/social" className="shrink-0 text-xs font-medium text-sx-accent hover:underline">
          Open in Social Autopilot →
        </Link>
      </Card>
    );
  }
  return (
    <Card variant="alert">
      <p className="text-sm font-medium text-sx-text">{what} isn&apos;t available yet.</p>
      <p className="mt-1 text-xs text-sx-text-muted">We&apos;re still building this out — check back soon.</p>
    </Card>
  );
}
