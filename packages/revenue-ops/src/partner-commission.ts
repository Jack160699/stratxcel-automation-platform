/**
 * Partner Commission & Revenue Attribution Engine
 * StratXcel Autonomous Commercial Operations
 *
 * Implements strict accounting separation across:
 * - pipeline value
 * - projected revenue
 * - signed value
 * - paid revenue
 * - net revenue
 * - commission payable
 */

export interface CommercialPartnerContract {
  partnerId: string;
  partnerName: string;
  partnerContactEmail?: string;
  commissionModel: "percentage_of_paid" | "fixed_bounty" | "tiered_volume";
  rateBps?: number; // Basis points (e.g. 800 = 8.0%)
  fixedBountyInr?: number;
  minimumDealValueInr?: number;
  payoutTrigger: "payment_received" | "deal_signed" | "milestone_completed";
  isActive: boolean;
}

export interface DealFinancialAccounting {
  leadId: string;
  dealId: string;
  partnerId: string;
  currency: "INR";
  pipelineValueInr: number;
  projectedRevenueInr: number;
  signedValueInr: number;
  paidRevenueInr: number;
  taxGstInr: number;
  platformNetRevenueInr: number;
  commissionPayableInr: number;
  partnerPayoutStatus: "PENDING_PAYMENT" | "ELIGIBLE_FOR_PAYOUT" | "PAID" | "DISPUTED";
  accountingBreakdown: {
    grossContractValue: number;
    gstRatePct: number;
    netBeforeTax: number;
    commissionRatePct: number;
    partnerCommissionAmount: number;
    stratxcelRetainedMargin: number;
    stratxcelGrossMarginPct: number;
  };
  calculatedAt: string;
}

/**
 * Calculates deterministic partner commission and separates financial states without leakage.
 */
export function calculatePartnerCommission(
  contract: CommercialPartnerContract,
  deal: {
    leadId: string;
    dealId: string;
    stage: "QUALIFIED" | "OPPORTUNITY" | "PROPOSAL" | "SIGNED" | "PAID";
    dealValueInr: number;
    amountPaidInr?: number;
    gstRatePct?: number;
  }
): DealFinancialAccounting {
  const gstRate = deal.gstRatePct ?? 18;
  const grossValue = Math.max(0, deal.dealValueInr);
  const paidValue = Math.max(0, deal.amountPaidInr ?? (deal.stage === "PAID" ? grossValue : 0));

  // 1. Pipeline value vs Projected revenue vs Signed value vs Paid revenue
  let pipelineValue = 0;
  let projectedRevenue = 0;
  let signedValue = 0;
  let paidRevenue = 0;

  switch (deal.stage) {
    case "QUALIFIED":
      pipelineValue = grossValue;
      projectedRevenue = Math.round(grossValue * 0.25); // 25% win prob
      break;
    case "OPPORTUNITY":
      pipelineValue = grossValue;
      projectedRevenue = Math.round(grossValue * 0.5); // 50% win prob
      break;
    case "PROPOSAL":
      pipelineValue = grossValue;
      projectedRevenue = Math.round(grossValue * 0.75); // 75% win prob
      break;
    case "SIGNED":
      pipelineValue = grossValue;
      signedValue = grossValue;
      projectedRevenue = grossValue;
      break;
    case "PAID":
      pipelineValue = grossValue;
      signedValue = grossValue;
      projectedRevenue = grossValue;
      paidRevenue = paidValue;
      break;
  }

  // 2. Net Revenue & GST Breakdown
  // If amount paid is inclusive of GST: net = paid / (1 + gstRate / 100)
  const netRevenue = Math.round((paidRevenue / (1 + gstRate / 100)) * 100) / 100;
  const taxGst = Math.round((paidRevenue - netRevenue) * 100) / 100;

  // 3. Commission Calculation
  let commissionPayable = 0;
  const commissionRatePct = (contract.rateBps ?? 800) / 100; // default 8.0%

  if (contract.isActive && paidRevenue > 0) {
    const minThreshold = contract.minimumDealValueInr ?? 0;
    if (grossValue >= minThreshold) {
      if (contract.commissionModel === "fixed_bounty") {
        commissionPayable = contract.fixedBountyInr ?? 0;
      } else {
        // Commission applied to net revenue (exclusive of GST tax)
        commissionPayable = Math.round((netRevenue * (commissionRatePct / 100)) * 100) / 100;
      }
    }
  }

  // 4. StratXcel Retained Margin
  const stratxcelRetainedMargin = Math.max(0, Math.round((netRevenue - commissionPayable) * 100) / 100);
  const grossMarginPct = netRevenue > 0 ? Math.round((stratxcelRetainedMargin / netRevenue) * 10000) / 100 : 0;

  const payoutStatus =
    deal.stage === "PAID" && paidRevenue >= grossValue && commissionPayable > 0
      ? "ELIGIBLE_FOR_PAYOUT"
      : "PENDING_PAYMENT";

  return {
    leadId: deal.leadId,
    dealId: deal.dealId,
    partnerId: contract.partnerId,
    currency: "INR",
    pipelineValueInr: pipelineValue,
    projectedRevenueInr: projectedRevenue,
    signedValueInr: signedValue,
    paidRevenueInr: paidRevenue,
    taxGstInr: taxGst,
    platformNetRevenueInr: netRevenue,
    commissionPayableInr: commissionPayable,
    partnerPayoutStatus: payoutStatus,
    accountingBreakdown: {
      grossContractValue: grossValue,
      gstRatePct: gstRate,
      netBeforeTax: netRevenue,
      commissionRatePct,
      partnerCommissionAmount: commissionPayable,
      stratxcelRetainedMargin,
      stratxcelGrossMarginPct: grossMarginPct,
    },
    calculatedAt: new Date().toISOString(),
  };
}
