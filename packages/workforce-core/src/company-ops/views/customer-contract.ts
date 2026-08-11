import type { BusinessGrowthPlan, CustomerFacingPlanContract } from "../../planning/types.ts";
import type { CustomerNextAction, CustomerViewContract } from "../types.ts";

/**
 * Data contract for future customer UI — no major redesign required.
 */
export function buildCustomerViewContract(input: {
  plan?: BusinessGrowthPlan | null;
  customerFacing?: CustomerFacingPlanContract | null;
  nextAction?: CustomerNextAction | null;
  businessName?: string | null;
}): CustomerViewContract {
  const cf = input.customerFacing ?? input.plan?.customerFacing;
  const next =
    input.nextAction && input.nextAction.kind !== "none"
      ? input.nextAction.title
      : (cf?.nextRecommendation ?? null);

  return {
    yourBusiness: cf?.yourBusiness ?? input.businessName ?? "Your business",
    currentPosition: cf?.yourCurrentPosition ?? "Position not yet diagnosed",
    yourCurrentPosition: cf?.yourCurrentPosition ?? "Position not yet diagnosed",
    whatsWorking: cf?.whatsWorking ?? [],
    biggestGrowthOpportunities: cf?.biggestGrowthOpportunities ?? [],
    thirtyDayPlan: cf?.thirtyDayPlanSummary ?? "30-day plan pending",
    thirtyDayPlanSummary: cf?.thirtyDayPlanSummary ?? "30-day plan pending",
    thisWeek: cf?.thisWeekFocus ?? "This week focus pending",
    thisWeekFocus: cf?.thisWeekFocus ?? "This week focus pending",
    workInProgress: cf?.workInProgress ?? [],
    needsYou: cf?.whatNeedsYou ?? (input.nextAction && input.nextAction.kind !== "none" ? [input.nextAction.detail] : []),
    whatNeedsYou: cf?.whatNeedsYou ?? (input.nextAction && input.nextAction.kind !== "none" ? [input.nextAction.detail] : []),
    results: cf?.results ?? [],
    nextRecommendation: next,
  };
}
