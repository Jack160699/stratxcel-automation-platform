import { describe, it, expect } from "vitest";
import {
  calculatePartnerCommission,
  type CommercialPartnerContract,
} from "../partner-commission.ts";

describe("Partner Commission & Revenue Attribution Engine", () => {
  const solarPartnerContract: CommercialPartnerContract = {
    partnerId: "partner_solar_raipur_01",
    partnerName: "Raipur Commercial Solar Power Corp",
    partnerContactEmail: "partner@raipursolarcorp.in",
    commissionModel: "percentage_of_paid",
    rateBps: 800, // 8.0%
    minimumDealValueInr: 100000,
    payoutTrigger: "payment_received",
    isActive: true,
  };

  it("Test 1: Qualified Stage pipeline accounting verified (Zero premature commission)", () => {
    const qualifiedAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_001",
      dealId: "deal_solar_001",
      stage: "QUALIFIED",
      dealValueInr: 500000,
    });

    expect(qualifiedAccounting.pipelineValueInr).toBe(500000);
    expect(qualifiedAccounting.projectedRevenueInr).toBe(125000); // 25% prob
    expect(qualifiedAccounting.signedValueInr).toBe(0);
    expect(qualifiedAccounting.paidRevenueInr).toBe(0);
    expect(qualifiedAccounting.commissionPayableInr).toBe(0);
    expect(qualifiedAccounting.partnerPayoutStatus).toBe("PENDING_PAYMENT");
  });

  it("Test 2: Proposal Stage weighted revenue projection verified", () => {
    const proposalAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_001",
      dealId: "deal_solar_001",
      stage: "PROPOSAL",
      dealValueInr: 500000,
    });

    expect(proposalAccounting.pipelineValueInr).toBe(500000);
    expect(proposalAccounting.projectedRevenueInr).toBe(375000);
    expect(proposalAccounting.paidRevenueInr).toBe(0);
    expect(proposalAccounting.commissionPayableInr).toBe(0);
  });

  it("Test 3: Paid Stage GST separation, net revenue, and 8% commission calculation verified", () => {
    const paidAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_001",
      dealId: "deal_solar_001",
      stage: "PAID",
      dealValueInr: 500000,
      amountPaidInr: 500000,
      gstRatePct: 18,
    });

    expect(paidAccounting.paidRevenueInr).toBe(500000);
    expect(paidAccounting.taxGstInr).toBe(76271.19);
    expect(paidAccounting.platformNetRevenueInr).toBe(423728.81);
    expect(paidAccounting.commissionPayableInr).toBe(33898.30);
    expect(paidAccounting.accountingBreakdown.stratxcelRetainedMargin).toBe(389830.51);
    expect(paidAccounting.partnerPayoutStatus).toBe("ELIGIBLE_FOR_PAYOUT");
  });

  it("Test 4: Minimum deal value threshold policy enforcement verified", () => {
    const smallDealAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_002",
      dealId: "deal_small_002",
      stage: "PAID",
      dealValueInr: 50000, // Below 100,000 threshold
      amountPaidInr: 50000,
    });

    expect(smallDealAccounting.commissionPayableInr).toBe(0);
    expect(smallDealAccounting.partnerPayoutStatus).toBe("PENDING_PAYMENT");
  });
});
