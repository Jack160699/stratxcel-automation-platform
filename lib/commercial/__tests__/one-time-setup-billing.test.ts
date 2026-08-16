import test from "node:test";
import assert from "node:assert/strict";
import { getServiceDefinition } from "../service-catalog.ts";
import { generateTailoredCustomerPlans } from "../plan-engine.ts";
import { monthlyRenewalEngine } from "../../billing/monthly-cycle.ts";
import type { RequirementSynthesisResult } from "../../intelligence/requirements/requirement-engine.ts";

test("Commercial Engine: One-Time Setup vs Monthly Recurring Services", async () => {
  const gbpCreation = getServiceDefinition("google_business_creation");
  assert.ok(gbpCreation);
  assert.equal(gbpCreation.billingType, "ONE_TIME");
  assert.equal(gbpCreation.standardMonthlyMrpPaise, 999_00);
  assert.equal(gbpCreation.premiumMonthlyMrpPaise, 1499_00);

  const gbpOptimization = getServiceDefinition("google_business_optimization");
  assert.ok(gbpOptimization);
  assert.equal(gbpOptimization.billingType, "RECURRING");

  // Month 1 Requirements including One-Time GBP Creation
  const month1Synthesis: RequirementSynthesisResult = {
    businessType: "Local Retail / Service",
    industry: "Bakery",
    requirements: [
      {
        requirementId: "req-gbp-create",
        title: "Create Verified Google Business Profile",
        priority: "REQUIRED",
        rationale: "New business has no Google presence.",
        recommendedServiceKey: "google_business_creation",
        expectedQuantity: 1,
        expectedFrequency: "one_time",
        estimatedImpact: "HIGH",
      },
      {
        requirementId: "req-gbp-opt",
        title: "Google Map Optimization & Weekly Posts",
        priority: "HIGH",
        rationale: "Drive local footfall.",
        recommendedServiceKey: "google_business_optimization",
        expectedQuantity: 4,
        expectedFrequency: "weekly",
        estimatedImpact: "HIGH",
      },
    ],
    unneededServices: [],
    strategicFocus: "Local footfall",
    confidenceBand: "HIGH",
  };

  const month1Plans = generateTailoredCustomerPlans("Fresh Bakery", month1Synthesis, {
    cycleMonth: "2026-09",
    tenantId: "tenant-bakery-1",
  });

  const month1Premium = month1Plans.recommendedPremiumPlan;
  const gbpCreateItem = month1Premium.items.find((i) => i.serviceKey === "google_business_creation");
  assert.ok(gbpCreateItem);
  assert.equal(gbpCreateItem.billingType, "ONE_TIME");

  // Run 26th Monthly Report & Adaptive Renewal for Month 2
  // When GBP Creation is complete, month 2 requirements override drops the one-time service
  const recap = await monthlyRenewalEngine.execute26thMonthlyReport({
    tenantId: "tenant-bakery-1",
    businessName: "Fresh Bakery",
    businessType: "Local Retail / Service",
    industry: "Bakery",
    operatingLocations: ["Raipur"],
    currentPlanMrpRupees: month1Premium.monthlyPriceRupees,
    cycleMonth: "2026-09",
    requirementOverride: () => ({
      ...month1Synthesis,
      requirements: month1Synthesis.requirements.filter((r) => r.recommendedServiceKey !== "google_business_creation"),
    }),
  });

  assert.ok(recap.adaptation);
  // Month 2 proposal should have a lower or equal MRP because one-time setup was removed
  assert.ok(recap.adaptation.priceDeltaRupees <= 0);
  if (recap.adaptation.changeType === "DECREASE") {
    assert.ok(recap.adaptation.explanation.whyItChanged.includes("Core technical fixes are complete"));
  }
});
