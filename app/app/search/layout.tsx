/**
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md (Update 14):
 * this route was gated behind NotV1CustomerRoute -- an unconditional
 * redirect with no auth/tenant/entitlement logic of its own, whose own doc
 * comment says only "prevents unfinished engineering surfaces from
 * rendering." The concrete reason it was unfinished was 13 real fabrication
 * defects in SearchGrowthDashboardView.tsx (fake AI-visibility scores, a
 * fake "in 2 days" date, fabricated competitor claims) -- now root-caused,
 * fixed, and covered by components/search-growth/__tests__/no-fabrication.test.ts.
 *
 * Real access control for this route does not come from this layout --
 * it comes from (a) app/app/layout.tsx one level up, which already
 * enforces real authentication and tenant resolution for every /app/*
 * route including this one, and (b) the EntitlementGate
 * (minTier="growth") already inside page.tsx, which enforces the real
 * RBAC/entitlement/feature-tier boundary for this specific feature. That
 * is the same real gating pattern app/app/integrations/layout.tsx (a
 * live, non-gated route) already uses -- a plain pass-through here, with
 * the actual protection living where the actual logic is.
 *
 * Scope: this change touches only this route's layout. The shared
 * NotV1CustomerRoute component, and the other 6 routes still using it
 * (ads, approvals, copilot, files, missions, reports), are untouched and
 * remain gated -- they have not been audited and this change makes no
 * claim about their readiness.
 */
export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
