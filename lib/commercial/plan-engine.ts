import type { RequirementItem, RequirementSynthesisResult } from "../intelligence/requirements/requirement-engine.ts";
import { getServiceDefinition } from "./service-catalog.ts";
import { calculatePlanTotalCost, type PlanCostBreakdown } from "./cost-brain.ts";
import { calculateServiceMrp } from "./pricing-brain.ts";

export interface PlanItemSpec {
  serviceKey: string;
  label: string;
  quantity: number;
  unit: string;
  frequency: string;
  qualityTier: "Standard" | "Premium";
  qualityDescription: string;
  itemPricePaise: number;
}

export interface GeneratedCustomerPlan {
  tier: "Standard" | "Premium";
  title: string;
  tagline: string;
  monthlyPricePaise: number;
  monthlyPriceRupees: number;
  items: PlanItemSpec[];
  costBreakdown: PlanCostBreakdown;
  projectedMarginPercentage: number;
  expectedOutcomes: string[];
  assumptions: string[];
}

export interface PlanComparisonTradeoffs {
  priceDifferenceRupees: number;
  quantityDifferences: Array<{ service: string; standardQty: number; premiumQty: number; unit: string }>;
  qualityDifferences: Array<{ service: string; standardQuality: string; premiumQuality: string }>;
  frequencyDifferences: Array<{ service: string; standardFreq: string; premiumFreq: string }>;
  excludedFromStandard: string[];
}

export interface TailoredPlanProposal {
  tenantId?: string;
  businessName: string;
  cycleMonth: string; // 'YYYY-MM'
  recommendedPremiumPlan: GeneratedCustomerPlan;
  standardAlternativePlan: GeneratedCustomerPlan;
  tradeoffs: PlanComparisonTradeoffs;
  generatedAt: string;
}

/**
 * Plan Architecture Engine.
 * Converts business requirements into two authoritative customer-facing tiers:
 * Recommended Premium Plan (actual business need) and Standard Alternative Plan.
 */
export function generateTailoredCustomerPlans(
  businessName: string,
  synthesis: RequirementSynthesisResult,
  options: { cycleMonth?: string; tenantId?: string } = {},
): TailoredPlanProposal {
  const cycleMonth = options.cycleMonth ?? new Date().toISOString().slice(0, 7);
  const activeReqs = synthesis.requirements.filter(
    (r) => r.priority === "REQUIRED" || r.priority === "HIGH" || r.priority === "MEDIUM",
  );

  // 1. Build Recommended Premium Plan (Full requirements scope at Premium Quality)
  const premiumItems: PlanItemSpec[] = [];
  const premiumCostItems: Array<{ serviceKey: string; quantity: number }> = [];

  for (const req of activeReqs) {
    const service = getServiceDefinition(req.recommendedServiceKey);
    if (!service) continue;

    const qty = Math.max(service.minQuantity, req.expectedQuantity || service.defaultMonthlyQuantity);
    const pricing = calculateServiceMrp(service.serviceKey, qty, "Premium");

    premiumItems.push({
      serviceKey: service.serviceKey,
      label: service.label,
      quantity: qty,
      unit: service.unit,
      frequency: req.expectedFrequency,
      qualityTier: "Premium",
      qualityDescription: service.premiumQuality.deliverableStandard,
      itemPricePaise: pricing.finalMrpPaise,
    });

    premiumCostItems.push({ serviceKey: service.serviceKey, quantity: qty });
  }

  const premiumCost = calculatePlanTotalCost(premiumCostItems, "Premium");
  const rawPremiumTotalPaise = premiumItems.reduce((sum, item) => sum + item.itemPricePaise, 0);
  // Round to clean plan price (e.g. ₹4,999, ₹9,999, ₹14,999)
  const premiumRupees = Math.round(rawPremiumTotalPaise / 100);
  const roundedPremiumRupees = Math.max(1999, Math.round(premiumRupees / 1000) * 1000 - 1);
  const finalPremiumPaise = roundedPremiumRupees * 100;

  const premiumPlan: GeneratedCustomerPlan = {
    tier: "Premium",
    title: "Recommended Premium Growth Plan",
    tagline: `Engineered specifically for ${businessName} to maximize local discovery, reputation, and autonomous customer acquisition.`,
    monthlyPricePaise: finalPremiumPaise,
    monthlyPriceRupees: roundedPremiumRupees,
    items: premiumItems,
    costBreakdown: premiumCost,
    projectedMarginPercentage: Math.round(((finalPremiumPaise - premiumCost.grandTotalCostPaise) / finalPremiumPaise) * 100),
    expectedOutcomes: [
      "Top-3 local Google Maps visibility for high-intent nearby customer searches",
      "Continuous stream of authentic 5-star customer reviews on Google",
      "Instant 24/7 WhatsApp customer response and lead qualification",
      "Zero customer loss from missed phone calls or unanswered messages",
      "Hands-off autonomous weekly growth execution with zero manual effort required",
    ],
    assumptions: [
      "Access to Google Business Profile or verified address verification assistance",
      "WhatsApp phone number authorization for automated reception",
    ],
  };

  // 2. Build Standard Alternative Plan (Core essentials at Standard Quality & reduced quantity)
  const standardItems: PlanItemSpec[] = [];
  const standardCostItems: Array<{ serviceKey: string; quantity: number }> = [];

  // Filter only Required & High priority for standard (omit Medium to lower cost)
  const standardReqs = activeReqs.filter((r) => r.priority === "REQUIRED" || r.priority === "HIGH");

  for (const req of standardReqs) {
    const service = getServiceDefinition(req.recommendedServiceKey);
    if (!service) continue;

    // Standard gets reduced quantity
    const qty = Math.max(service.minQuantity, Math.ceil((req.expectedQuantity || service.defaultMonthlyQuantity) * 0.6));
    const pricing = calculateServiceMrp(service.serviceKey, qty, "Standard");

    standardItems.push({
      serviceKey: service.serviceKey,
      label: service.label,
      quantity: qty,
      unit: service.unit,
      frequency: req.expectedFrequency === "weekly" ? "bi-weekly" : req.expectedFrequency,
      qualityTier: "Standard",
      qualityDescription: service.standardQuality.deliverableStandard,
      itemPricePaise: pricing.finalMrpPaise,
    });

    standardCostItems.push({ serviceKey: service.serviceKey, quantity: qty });
  }

  const standardCost = calculatePlanTotalCost(standardCostItems, "Standard");
  const rawStandardTotalPaise = standardItems.reduce((sum, item) => sum + item.itemPricePaise, 0);
  const standardRupees = Math.round(rawStandardTotalPaise / 100);
  const roundedStandardRupees = Math.max(999, Math.round(standardRupees / 1000) * 1000 - 1);
  const finalStandardPaise = roundedStandardRupees * 100;

  const standardPlan: GeneratedCustomerPlan = {
    tier: "Standard",
    title: "Standard Alternative Plan",
    tagline: `Essential foundation package covering core visibility and lead reception with bi-weekly updates.`,
    monthlyPricePaise: finalStandardPaise,
    monthlyPriceRupees: roundedStandardRupees,
    items: standardItems,
    costBreakdown: standardCost,
    projectedMarginPercentage: Math.round(((finalStandardPaise - standardCost.grandTotalCostPaise) / finalStandardPaise) * 100),
    expectedOutcomes: [
      "Active verified Google Business profile with regular baseline updates",
      "Standard review collection link setup",
      "Essential business hours automated auto-reply on WhatsApp",
    ],
    assumptions: [
      "Customer will handle complex customized enquiries manually",
    ],
  };

  // 3. Tradeoffs Comparison
  const quantityDifferences = premiumItems
    .map((pItem) => {
      const sItem = standardItems.find((s) => s.serviceKey === pItem.serviceKey);
      return {
        service: pItem.label,
        standardQty: sItem?.quantity ?? 0,
        premiumQty: pItem.quantity,
        unit: pItem.unit,
      };
    })
    .filter((q) => q.standardQty !== q.premiumQty);

  const qualityDifferences = premiumItems
    .map((pItem) => {
      const sItem = standardItems.find((s) => s.serviceKey === pItem.serviceKey);
      const service = getServiceDefinition(pItem.serviceKey)!;
      return {
        service: pItem.label,
        standardQuality: sItem?.qualityDescription ?? "Not included in Standard",
        premiumQuality: pItem.qualityDescription,
      };
    });

  const frequencyDifferences = premiumItems
    .map((pItem) => {
      const sItem = standardItems.find((s) => s.serviceKey === pItem.serviceKey);
      return {
        service: pItem.label,
        standardFreq: sItem?.frequency ?? "None",
        premiumFreq: pItem.frequency,
      };
    })
    .filter((f) => f.standardFreq !== f.premiumFreq);

  const excludedFromStandard = premiumItems
    .filter((p) => !standardItems.some((s) => s.serviceKey === p.serviceKey))
    .map((p) => p.label);

  return {
    tenantId: options.tenantId,
    businessName,
    cycleMonth,
    recommendedPremiumPlan: premiumPlan,
    standardAlternativePlan: standardPlan,
    tradeoffs: {
      priceDifferenceRupees: roundedPremiumRupees - roundedStandardRupees,
      quantityDifferences,
      qualityDifferences,
      frequencyDifferences,
      excludedFromStandard,
    },
    generatedAt: new Date().toISOString(),
  };
}
