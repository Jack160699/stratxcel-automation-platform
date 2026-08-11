import type { BusinessGrowthEntitlementSnapshot } from "../../planning/types.ts";
import type { GrowthBottleneck } from "../../planning/growth-types.ts";
import type { CommercialFitRecommendation, PlanCatalogueEntryInput } from "../types.ts";

export class BillingMutationError extends Error { constructor(m: string) { super(m); this.name = "BillingMutationError"; } }

const DOMAIN: Record<string, string> = { SLOW_LEAD_RESPONSE: "crm", WEAK_FOLLOW_UP: "crm", POOR_LEAD_CAPTURE: "website", WEAK_WEBSITE_CONVERSION: "website", WEAK_SEARCH_VISIBILITY: "seo", LOW_DISCOVERY: "seo", MISSING_DIGITAL_FOUNDATION: "website" };
const GUARDS = { doNotActivateSubscription: true as const, doNotChargeCard: true as const, doNotGrantEntitlements: true as const };

export interface CommercialFitInput { bottlenecks: readonly GrowthBottleneck[]; catalogue: readonly PlanCatalogueEntryInput[]; entitlementSnapshot: BusinessGrowthEntitlementSnapshot; }

function domains(bottlenecks: readonly GrowthBottleneck[]): Set<string> { return new Set(bottlenecks.map((b) => DOMAIN[b.code] ?? "strategy")); }
function entitled(plan: PlanCatalogueEntryInput, snap: BusinessGrowthEntitlementSnapshot): boolean {
  return plan.entitlementKeys.every((k) => (snap.relevantEntitlements[k] ?? 0) > 0) || (snap.planTier ?? "").toLowerCase() === plan.planKey;
}

export function evaluateCommercialFit(input: CommercialFitInput): CommercialFitRecommendation {
  const req = domains(input.bottlenecks);
  const ids = input.bottlenecks.map((b) => b.id);
  if (input.bottlenecks.length === 0) return { outcome: "NO_CHANGE_NEEDED", recommendedPlanKey: null, recommendedLabel: "Maintain current posture", reason: "No high-priority bottlenecks", coveringBottleneckIds: [], uncoveredDomains: [], ...GUARDS };
  const sorted = [...input.catalogue].sort((a, b) => a.tierRank - b.tierRank);
  const already = sorted.find((p) => entitled(p, input.entitlementSnapshot) && [...req].every((d) => p.coveredDomains.includes(d)));
  if (already) return { outcome: "ALREADY_ENTITLED", recommendedPlanKey: already.planKey, recommendedLabel: already.label, reason: "USE_CURRENT_ENTITLEMENT — existing entitlements cover diagnosed domains", coveringBottleneckIds: ids, uncoveredDomains: [], ...GUARDS };
  const smallest = sorted.find((p) => [...req].every((d) => p.coveredDomains.includes(d)));
  if (smallest) return { outcome: "SMALLEST_COVERING_OPTION", recommendedPlanKey: smallest.planKey, recommendedLabel: smallest.label, reason: "Smallest tier covering all diagnosed domains", coveringBottleneckIds: ids, uncoveredDomains: [], ...GUARDS };
  const partial = sorted.find((p) => p.coveredDomains.some((d) => req.has(d)));
  if (partial) return { outcome: "PARTIAL_COVERAGE", recommendedPlanKey: partial.planKey, recommendedLabel: partial.label, reason: "Partial catalogue coverage — scoped custom work for remainder", coveringBottleneckIds: ids, uncoveredDomains: [...req].filter((d) => !partial.coveredDomains.includes(d)), ...GUARDS };
  return { outcome: "CUSTOM", recommendedPlanKey: null, recommendedLabel: "Custom scoped engagement", reason: "No catalogue plan covers full domain set", coveringBottleneckIds: ids, uncoveredDomains: [...req], ...GUARDS };
}

export function assertRecommendationCannotMutateBilling(rec: CommercialFitRecommendation): void {
  if (rec.doNotActivateSubscription !== true || rec.doNotChargeCard !== true || rec.doNotGrantEntitlements !== true) throw new BillingMutationError("recommendation_must_not_mutate_billing");
}

export function finalizeCommercialFit(input: CommercialFitInput): CommercialFitRecommendation {
  const rec = evaluateCommercialFit(input); assertRecommendationCannotMutateBilling(rec); return rec;
}
