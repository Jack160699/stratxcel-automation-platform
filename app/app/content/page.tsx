import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function ContentPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="Content"
      note="This generalized content overview isn't wired up yet — the real, working content pipeline lives at /admin/social today (Create, Planner, Inbox, Analytics). See docs/product-design/CURRENT_TO_FINAL_MIGRATION_PLAN.md §3 for the migration plan."
    />
  );
}
