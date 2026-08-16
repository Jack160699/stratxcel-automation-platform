import { getServiceDefinition, type ModularServiceDefinition } from "./service-catalog.ts";
import { calculateServiceCost, type ServiceCostEstimate } from "./cost-brain.ts";

export interface ServicePricingResult {
  serviceKey: string;
  quantity: number;
  tier: "Standard" | "Premium";
  internalCostPaise: number;
  targetMarginPercentage: number;
  calculatedMrpPaise: number;
  finalMrpPaise: number; // Rounded to clean commercial numbers (e.g. ending in 9900)
}

export interface MarketLocationFactors {
  tier: "tier_1" | "tier_2" | "tier_3";
  city?: string;
}

/**
 * Deterministic Pricing Brain.
 * Translates internal costs + target margins + market factors into customer prices.
 * AI models NEVER invent or negotiate prices.
 */
export function calculateServiceMrp(
  serviceKey: string,
  quantity: number,
  tier: "Standard" | "Premium",
  market?: MarketLocationFactors,
): ServicePricingResult {
  const service = getServiceDefinition(serviceKey);
  if (!service) {
    throw new Error(`PricingBrain: Unknown service key ${serviceKey}`);
  }

  const cost = calculateServiceCost(serviceKey, quantity, tier);
  const baseMrp =
    tier === "Premium" ? service.premiumMonthlyMrpPaise : service.standardMonthlyMrpPaise;

  // Market tier adjustment: Tier 2/3 gets slight competitive adjustment (max 10% discount from standard)
  let marketMultiplier = 1.0;
  if (market?.tier === "tier_2") marketMultiplier = 0.95;
  else if (market?.tier === "tier_3") marketMultiplier = 0.90;

  const targetMarginPercentage = 65; // Target 65% gross margin
  const calculatedMrp = Math.round(baseMrp * (quantity / service.defaultMonthlyQuantity) * marketMultiplier);

  // Round to clean price ending in ₹...99 (e.g. 1999_00)
  const rupees = Math.round(calculatedMrp / 100);
  const roundedRupees = Math.max(499, Math.round(rupees / 100) * 100 - 1);
  const finalMrpPaise = roundedRupees * 100;

  return {
    serviceKey,
    quantity,
    tier,
    internalCostPaise: cost.totalCostPaise,
    targetMarginPercentage,
    calculatedMrpPaise: calculatedMrp,
    finalMrpPaise,
  };
}
