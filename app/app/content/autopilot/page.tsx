import { requireClientContext } from "@/lib/tenants/client-context";
import { AutopilotDashboard } from "./AutopilotDashboard";

/** Client-facing Social Autopilot package surface — the generalized /app counterpart of the staff-run admin Social Autopilot tool, scoped entirely to this tenant's own standing authorization. */
export default async function ContentAutopilotPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Social Autopilot</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Your content package — prepared, scheduled, and published automatically within the plan you chose.</p>
      </header>
      <AutopilotDashboard />
    </div>
  );
}
