import { requireClientContext } from "@/lib/tenants/client-context";
import { AutopilotDashboard } from "./AutopilotDashboard";

/** Client-facing Social Autopilot package surface — the generalized /app
 * counterpart of the staff-run admin Social Autopilot tool, scoped
 * entirely to this tenant's own standing authorization.
 *
 * Unlock Autopilot For All Plans mission: Social Autopilot is now the
 * platform's core feature, available on every plan (see PLAN_CAPABILITIES
 * in packages/payments-and-wallet/src/entitlements.ts). The page-level
 * EntitlementGate that used to sit here is REMOVED, not just widened --
 * its own TIER_RANK map (components/ui/EntitlementGate.tsx) only knows
 * the legacy free/starter/growth/business/scale identifiers and has zero
 * awareness of the current commercial model's real tier keys (seo,
 * social, seo_and_social, advanced_seo, advanced_social, advanced_growth,
 * website_*) -- any of those looked up `?? 0`, the SAME rank as "free",
 * so this gate was silently blocking every real, currently-paying tenant
 * on the active commercial model from ever reaching this page at all,
 * regardless of their actual plan. AutopilotDashboard already handles its
 * own real eligibility/activation state (via the live GET /api/platform/
 * social/autopilot response, not a static tier guess) and renders an
 * honest checklist/CTA rather than crashing for any tenant -- this outer
 * gate added nothing but a second, wrong, redundant gate. */
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
