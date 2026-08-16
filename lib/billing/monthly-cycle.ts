import type { TailoredPlanProposal } from "../commercial/plan-engine.ts";
import { generateTailoredCustomerPlans } from "../commercial/plan-engine.ts";
import type { RequirementSynthesisResult } from "../intelligence/requirements/requirement-engine.ts";
import { synthesizeBusinessRequirements } from "../intelligence/requirements/requirement-engine.ts";
import type { MonthlyValueReport, ValueLedgerService } from "../reporting/value-ledger.ts";
import { valueLedgerService } from "../reporting/value-ledger.ts";

export interface MonthlyCalendarCycle {
  currentCycleMonth: string; // 'YYYY-MM'
  nextCycleMonth: string; // 'YYYY-MM'
  reportGenerationDay: 26;
  gracePeriodDays: [1, 2, 3];
  serviceStopDay: 4;
  renewalWindowDays: [4, 5];
}

export interface MonthlyCycleStatus {
  tenantId: string;
  cycleMonth: string;
  state: "ACTIVE" | "GRACE_PERIOD" | "SERVICE_STOPPED" | "RENEWED" | "CANCELLED";
  reportGenerated: boolean;
  reportGeneratedAt?: string;
  unpaid: boolean;
  currentPlanMrpRupees: number;
}

export interface NextMonthPlanAdaptation {
  tenantId: string;
  currentCycleMonth: string;
  nextCycleMonth: string;
  currentPlanMrpRupees: number;
  proposedNextPlanMrpRupees: number;
  priceDeltaRupees: number; // positive if increase, negative if decrease, 0 if unchanged
  changeType: "INCREASE" | "DECREASE" | "UNCHANGED";
  explanation: {
    whatChanged: string[];
    whyItChanged: string;
    additionalWork: string[];
    expectedBenefit: string;
  };
  proposedPlan: TailoredPlanProposal;
}

export interface FullMonthlyRecapPackage {
  tenantId: string;
  businessName: string;
  cycleMonth: string;
  valueReport: MonthlyValueReport;
  adaptation: NextMonthPlanAdaptation;
  generatedAt: string;
}

/**
 * Monthly Adaptive Renewal Engine.
 * Manages calendar-month billing cycles, 26th report generation, grace periods,
 * service stops, and month-to-month requirement-driven plan adaptations.
 */
export class MonthlyRenewalEngine {
  private generatedRecapCache = new Map<string, FullMonthlyRecapPackage>();
  private tenantCycleStates = new Map<string, MonthlyCycleStatus>();

  getCalendarCycle(date = new Date()): MonthlyCalendarCycle {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed
    const currentCycleMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

    const nextDate = new Date(Date.UTC(year, month + 1, 1));
    const nextCycleMonth = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`;

    return {
      currentCycleMonth,
      nextCycleMonth,
      reportGenerationDay: 26,
      gracePeriodDays: [1, 2, 3],
      serviceStopDay: 4,
      renewalWindowDays: [4, 5],
    };
  }

  /**
   * Generates the 26th Monthly Work & Value Report + Next Month Recommendation.
   * Guaranteed IDEMPOTENT: Multiple runs for same tenant/month return existing recap.
   */
  async execute26thMonthlyReport(input: {
    tenantId: string;
    businessName: string;
    businessType: string;
    industry: string;
    operatingLocations: string[];
    currentPlanMrpRupees: number;
    cycleMonth?: string;
    requirementOverride?: (base: RequirementSynthesisResult) => RequirementSynthesisResult;
    ledger?: ValueLedgerService;
  }): Promise<FullMonthlyRecapPackage> {
    const cycle = this.getCalendarCycle();
    const cycleMonth = input.cycleMonth ?? cycle.currentCycleMonth;
    const cacheKey = `${input.tenantId}:${cycleMonth}`;

    // Idempotency check: Return cached package if already generated
    if (this.generatedRecapCache.has(cacheKey)) {
      return this.generatedRecapCache.get(cacheKey)!;
    }

    const ledger = input.ledger ?? valueLedgerService;
    const valueReport = await ledger.generateMonthlyValueReport(
      input.tenantId,
      cycleMonth,
      input.businessName,
    );

    // Recalculate next-month requirements
    let synthesis = synthesizeBusinessRequirements({
      tenantId: input.tenantId,
      businessName: input.businessName,
      businessType: input.businessType,
      industry: input.industry,
      operatingLocations: input.operatingLocations,
    });

    if (input.requirementOverride) {
      synthesis = input.requirementOverride(synthesis);
    }

    const proposedPlans = generateTailoredCustomerPlans(input.businessName, synthesis, {
      cycleMonth: cycle.nextCycleMonth,
      tenantId: input.tenantId,
    });

    const proposedMrp = proposedPlans.recommendedPremiumPlan.monthlyPriceRupees;
    const currentMrp = input.currentPlanMrpRupees;
    const delta = proposedMrp - currentMrp;

    let changeType: "INCREASE" | "DECREASE" | "UNCHANGED" = "UNCHANGED";
    if (delta > 0) changeType = "INCREASE";
    else if (delta < 0) changeType = "DECREASE";

    let explanation: NextMonthPlanAdaptation["explanation"] = {
      whatChanged: ["Requirements maintained for consistent growth."],
      whyItChanged: "Steady ongoing execution.",
      additionalWork: [],
      expectedBenefit: "Maintains strong local map dominance and high review volume.",
    };

    if (changeType === "DECREASE") {
      explanation = {
        whatChanged: ["Initial foundation & technical SEO setup completed."],
        whyItChanged: "Core technical fixes are complete, transitioning to ongoing maintenance mode.",
        additionalWork: [],
        expectedBenefit: "Preserves existing rankings at lower operational cost.",
      };
    } else if (changeType === "INCREASE") {
      explanation = {
        whatChanged: ["Added multi-channel expansion or increased campaign volume."],
        whyItChanged: "Business scale warrants higher lead acquisition frequency.",
        additionalWork: ["Additional weekly updates & creative asset packages."],
        expectedBenefit: "Accelerates customer acquisition velocity and market capture.",
      };
    }

    const adaptation: NextMonthPlanAdaptation = {
      tenantId: input.tenantId,
      currentCycleMonth: cycleMonth,
      nextCycleMonth: cycle.nextCycleMonth,
      currentPlanMrpRupees: currentMrp,
      proposedNextPlanMrpRupees: proposedMrp,
      priceDeltaRupees: delta,
      changeType,
      explanation,
      proposedPlan: proposedPlans,
    };

    const fullPackage: FullMonthlyRecapPackage = {
      tenantId: input.tenantId,
      businessName: input.businessName,
      cycleMonth,
      valueReport,
      adaptation,
      generatedAt: new Date().toISOString(),
    };

    this.generatedRecapCache.set(cacheKey, fullPackage);

    // Update cycle state
    this.tenantCycleStates.set(input.tenantId, {
      tenantId: input.tenantId,
      cycleMonth,
      state: "ACTIVE",
      reportGenerated: true,
      reportGeneratedAt: fullPackage.generatedAt,
      unpaid: false,
      currentPlanMrpRupees: currentMrp,
    });

    return fullPackage;
  }

  /**
   * Evaluates grace period and service stop status based on calendar day and payment state.
   */
  evaluateBillingStatus(
    tenantId: string,
    currentDay: number,
    isPaid: boolean,
  ): MonthlyCycleStatus {
    const cycle = this.getCalendarCycle();
    let state: "ACTIVE" | "GRACE_PERIOD" | "SERVICE_STOPPED" | "RENEWED" = "ACTIVE";

    if (!isPaid) {
      if (currentDay >= 1 && currentDay <= 3) {
        state = "GRACE_PERIOD";
      } else if (currentDay >= 4) {
        state = "SERVICE_STOPPED";
      }
    } else {
      state = currentDay >= 4 ? "RENEWED" : "ACTIVE";
    }

    const status: MonthlyCycleStatus = {
      tenantId,
      cycleMonth: cycle.currentCycleMonth,
      state,
      reportGenerated: true,
      unpaid: !isPaid,
      currentPlanMrpRupees: 4999,
    };

    this.tenantCycleStates.set(tenantId, status);
    return status;
  }
}

export const monthlyRenewalEngine = new MonthlyRenewalEngine();
