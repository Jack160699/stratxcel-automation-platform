import { requireClientContext } from "@/lib/tenants/client-context";
import { EntitlementGate } from "@/components/ui/EntitlementGate";
import { AutopilotDashboard } from "./AutopilotDashboard";

/** Client-facing Social Autopilot package surface — the generalized /app counterpart of the staff-run admin Social Autopilot tool, scoped entirely to this tenant's own standing authorization. Gated up front by plan rather than only failing on activation, so a locked-out tenant sees an honest upgrade prompt instead of a dead-end activation flow.
 *
 * Subscription-Gated Visual Archetypes brief's authoritative commercial
 * decision: Starter (₹2,999) has Social Autopilot ENABLED (automated
 * only, forced BASIC_ESSENTIAL, 12/month, 0 manual) -- this gate was
 * previously minTier="growth" from before that decision and would have
 * locked every Starter tenant out of the page entirely. AutopilotDashboard
 * itself (via VisualStyleOnboarding/ManualArchetypeGeneration's own
 * premiumSelectionAvailable check) already renders the correct
 * Starter-vs-Growth+ experience beneath this gate -- this only controls
 * "can this tenant reach the page at all." */
export default async function ContentAutopilotPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Social Autopilot</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Your content package — prepared, scheduled, and published automatically within the plan you chose.</p>
      </header>
      <EntitlementGate
        tenantId={ctx.accessMode === "customer" ? ctx.workspaceTenant.tenantId : undefined}
        minTier="starter"
        featureName="Social Autopilot"
      >
        <AutopilotDashboard />
      </EntitlementGate>
    </div>
  );
}
