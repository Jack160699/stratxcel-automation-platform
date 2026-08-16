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

  const month1Synthesis: RequirementSynthesisResult = {
    requirements: [
      {
        id: "req-1",
        requirementKey: "req-gbp-create",
        title: "Create Verified Google Business Profile",
        priority: "REQUIRED",
        reason: "New business has no Google presence.",
        evidence: "Missing Google Map listing",
        businessImpact: "Enables discovery on Google Maps",
        confidence: "HIGH",
        recommendedServiceKey: "google_business_creation",
        expectedQuantity: 1,
        expectedFrequency: "one_time",
        dependencies: [],
      },
      {
        id: "req-2",
        requirementKey: "req-gbp-opt",
        title: "Google Map Optimization & Weekly Posts",
        priority: "HIGH",
        reason: "Drive local footfall.",
        evidence: "Low local search ranking",
        businessImpact: "Improves local visibility",
        confidence: "HIGH",
        recommendedServiceKey: "google_business_optimization",
        expectedQuantity: 4,
        expectedFrequency: "weekly",
        dependencies: [],
      },
    ],
    highPriorityCount: 2,
    unneededServicesCount: 0,
    executiveSummary: "Local bakery requiring initial profile setup and weekly posts.",
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
