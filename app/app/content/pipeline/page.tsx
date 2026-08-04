import { requireClientContext } from "@/lib/tenants/client-context";
import { Card, CardHeading } from "@/components/ui/Card";
import { StaffScopedNotice } from "../StaffScopedNotice";

const STAGES = ["Draft", "Awaiting approval", "Scheduled", "Published"];

/** Pipeline — kanban-style content stages. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalizes Social Autopilot's approval/publish flow. */
export default async function ContentPipelinePage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Pipeline</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every piece of content, from draft to published.</p>
      </header>

      <StaffScopedNotice what="Pipeline" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => (
          <Card key={stage} variant="nested" className="min-h-[160px]">
            <CardHeading>{stage}</CardHeading>
            <p className="mt-3 text-xs text-sx-text-subtle">Nothing here.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
