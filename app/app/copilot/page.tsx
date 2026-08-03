import { requireClientContext } from "@/lib/tenants/client-context";
import { FoundationPage } from "../FoundationPage";

export default async function CopilotPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  return (
    <FoundationPage
      title="Copilot"
      note="The client-facing Copilot thread (docs/product-design/PAGE_BY_PAGE_SPECIFICATIONS.md) isn't wired up yet — Social Autopilot's Copilot at /admin/social/copilot is the real, working implementation this will generalize from."
    />
  );
}
