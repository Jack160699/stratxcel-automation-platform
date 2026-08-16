import assert from "node:assert/strict";
import { synthesizeBusinessRequirements } from "../../intelligence/requirements/requirement-engine.ts";
import { generateTailoredCustomerPlans } from "../plan-engine.ts";
import { calculateServiceCost, calculatePlanTotalCost, analyzeCostVariance } from "../cost-brain.ts";
import { calculateServiceMrp } from "../pricing-brain.ts";

async function testPricingAndPlanEngine() {
  console.log("Testing Pricing Brain, Cost Brain, and Plan Engine...");

  // 1. Test Cost Brain deterministic calculation
  const gbpCost = calculateServiceCost("google_business_optimization", 4, "Premium");
  assert.ok(gbpCost.totalCostPaise > 0);
  assert.equal(gbpCost.tier, "Premium");
  assert.ok(gbpCost.computeCostPaise > 0);
  assert.ok(gbpCost.infraCostPaise > 0);

  // 2. Test Pricing Brain MRP derivation
  const gbpPricing = calculateServiceMrp("google_business_optimization", 4, "Premium");
  assert.ok(gbpPricing.finalMrpPaise > gbpCost.totalCostPaise, "MRP must exceed internal cost");
  assert.ok(gbpPricing.finalMrpPaise % 100 === 0, "MRP must be in whole rupees");

  // 3. Test Plan Engine generation for General Store
  const generalStoreSynthesis = synthesizeBusinessRequirements({
    businessName: "Sharma Supermarket",
    businessType: "General Store / Retail",
    industry: "Retail Provisions",
    operatingLocations: ["Raipur"],
  });

  const proposal = generateTailoredCustomerPlans("Sharma Supermarket", generalStoreSynthesis);

  // Invariant 1: Exactly TWO customer tiers generated: Recommended Premium & Standard Alternative
  assert.ok(proposal.recommendedPremiumPlan);
  assert.ok(proposal.standardAlternativePlan);
  assert.equal(proposal.recommendedPremiumPlan.tier, "Premium");
  assert.equal(proposal.standardAlternativePlan.tier, "Standard");

  // Invariant 2: Premium plan price > Standard plan price
  assert.ok(
    proposal.recommendedPremiumPlan.monthlyPriceRupees >
      proposal.standardAlternativePlan.monthlyPriceRupees,
    "Premium plan must cost more than Standard alternative",
  );

  // Invariant 3: Both plans must have positive projected margins
  assert.ok(proposal.recommendedPremiumPlan.projectedMarginPercentage >= 40);
  assert.ok(proposal.standardAlternativePlan.projectedMarginPercentage >= 40);

  // Invariant 4: Tradeoffs must be explicitly calculated and visible
  assert.ok(proposal.tradeoffs.priceDifferenceRupees > 0);
  assert.ok(proposal.tradeoffs.qualityDifferences.length > 0);

  // Invariant 5: Social autopilot must NOT be present in either plan for General Store
  assert.equal(
    proposal.recommendedPremiumPlan.items.some((i) => i.serviceKey === "social_autopilot"),
    false,
    "General Store Premium Plan must NOT include unneeded social media",
  );
  assert.equal(
    proposal.standardAlternativePlan.items.some((i) => i.serviceKey === "social_autopilot"),
    false,
    "General Store Standard Plan must NOT include unneeded social media",
  );

  // 4. Test Cost Variance Analysis
  const varianceReport = analyzeCostVariance(100_00, 95_00, 150_00);
  assert.equal(varianceReport.isWithinBudget, true);
  assert.equal(varianceReport.variancePaise, -5_00);

  console.log("pricing-plan-engine.test.ts: ALL PASS (Cost calculation, Deterministic MRP, Standard vs Premium, Tradeoff transparency)");
}

testPricingAndPlanEngine().catch((err) => {
  console.error("Pricing and Plan Engine test failed:", err);
  process.exit(1);
});
