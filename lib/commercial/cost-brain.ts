import { getServiceDefinition, type ModularServiceDefinition } from "./service-catalog.ts";

export interface ServiceCostEstimate {
  serviceKey: string;
  quantity: number;
  tier: "Standard" | "Premium";
  computeCostPaise: number;
  infraCostPaise: number;
  mediaCostPaise: number;
  totalCostPaise: number;
}

export interface PlanCostBreakdown {
  tier: "Standard" | "Premium";
  services: ServiceCostEstimate[];
  totalInternalCostPaise: number;
  infraOverheadPaise: number;
  riskReservePaise: number;
  grandTotalCostPaise: number;
}

export interface CostVarianceReport {
  estimatedCostPaise: number;
  actualCostPaise: number;
  variancePaise: number;
  variancePercentage: number;
  isWithinBudget: boolean;
}

/**
 * Deterministic Cost Brain.
 * Calculates exact internal costs for services, missions, and plan packages.
 */
export function calculateServiceCost(
  serviceKey: string,
  quantity: number,
  tier: "Standard" | "Premium",
): ServiceCostEstimate {
  const service = getServiceDefinition(serviceKey);
  if (!service) {
    throw new Error(`Unknown service key in cost calculation: ${serviceKey}`);
  }

  const multiplier = tier === "Premium" ? 1.8 : 1.0;
  const baseCost = service.baseInternalCostPaise * quantity;
  const computeCost = Math.round(baseCost * multiplier);
  const infraCost = Math.round(computeCost * 0.2); // 20% database & queue infrastructure
  const mediaCost = serviceKey === "social_autopilot" || serviceKey === "paid_advertising"
    ? (tier === "Premium" ? 30_00 * quantity : 10_00 * quantity)
    : 0;

  const total = computeCost + infraCost + mediaCost;

  return {
    serviceKey,
    quantity,
    tier,
    computeCostPaise: computeCost,
    infraCostPaise: infraCost,
    mediaCostPaise: mediaCost,
    totalCostPaise: total,
  };
}

/**
 * Calculates total internal cost for an entire monthly plan bundle.
 */
export function calculatePlanTotalCost(
  items: Array<{ serviceKey: string; quantity: number }>,
  tier: "Standard" | "Premium",
): PlanCostBreakdown {
  const services = items.map((item) => calculateServiceCost(item.serviceKey, item.quantity, tier));
  const totalServicesCost = services.reduce((sum, s) => sum + s.totalCostPaise, 0);

  // 15% platform shared overhead (WhatsApp gateway, serverless workers, storage)
  const infraOverheadPaise = Math.round(totalServicesCost * 0.15);
  // 10% risk reserve for unexpected retries / model failovers
  const riskReservePaise = Math.round(totalServicesCost * 0.1);
  const grandTotal = totalServicesCost + infraOverheadPaise + riskReservePaise;

  return {
    tier,
    services,
    totalInternalCostPaise: totalServicesCost,
    infraOverheadPaise,
    riskReservePaise,
    grandTotalCostPaise: grandTotal,
  };
}

/**
 * Analyzes variance between estimated and actual internal costs.
 */
export function analyzeCostVariance(
  estimatedCostPaise: number,
  actualCostPaise: number,
  budgetCeilingPaise: number,
): CostVarianceReport {
  const variancePaise = actualCostPaise - estimatedCostPaise;
  const variancePercentage =
    estimatedCostPaise > 0 ? (variancePaise / estimatedCostPaise) * 100 : 0;

  return {
    estimatedCostPaise,
    actualCostPaise,
    variancePaise,
    variancePercentage: Math.round(variancePercentage * 10) / 10,
    isWithinBudget: actualCostPaise <= budgetCeilingPaise,
  };
}
