import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

    assert.equal(qualifiedAccounting.pipelineValueInr, 500000);
    assert.equal(qualifiedAccounting.projectedRevenueInr, 125000); // 25% prob
    assert.equal(qualifiedAccounting.signedValueInr, 0);
    assert.equal(qualifiedAccounting.paidRevenueInr, 0);
    assert.equal(qualifiedAccounting.commissionPayableInr, 0);
    assert.equal(qualifiedAccounting.partnerPayoutStatus, "PENDING_PAYMENT");
  });

  it("Test 2: Proposal Stage weighted revenue projection verified", () => {
    const proposalAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_001",
      dealId: "deal_solar_001",
      stage: "PROPOSAL",
      dealValueInr: 500000,
    });

    assert.equal(proposalAccounting.pipelineValueInr, 500000);
    assert.equal(proposalAccounting.projectedRevenueInr, 375000);
    assert.equal(proposalAccounting.paidRevenueInr, 0);
    assert.equal(proposalAccounting.commissionPayableInr, 0);
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

    assert.equal(paidAccounting.paidRevenueInr, 500000);
    assert.equal(paidAccounting.taxGstInr, 76271.19);
    assert.equal(paidAccounting.platformNetRevenueInr, 423728.81);
    assert.equal(paidAccounting.commissionPayableInr, 33898.30);
    assert.equal(paidAccounting.accountingBreakdown.stratxcelRetainedMargin, 389830.51);
    assert.equal(paidAccounting.partnerPayoutStatus, "ELIGIBLE_FOR_PAYOUT");
  });

  it("Test 4: Minimum deal value threshold policy enforcement verified", () => {
    const smallDealAccounting = calculatePartnerCommission(solarPartnerContract, {
      leadId: "lead_002",
      dealId: "deal_small_002",
      stage: "PAID",
      dealValueInr: 50000, // Below 100,000 threshold
      amountPaidInr: 50000,
    });

    assert.equal(smallDealAccounting.commissionPayableInr, 0);
    assert.equal(smallDealAccounting.partnerPayoutStatus, "PENDING_PAYMENT");
  });
});
