/**
 * Provider-neutral cost metadata — unknown remains unknown.
 */

import type { CostObservation, MetricPeriod } from "./types.ts";

export interface CreateCostObservationInput {
  id: string;
  tenantId: string;
  provider?: string;
  amount: number | null;
  currency?: string;
  period: MetricPeriod;
  evidenceIds: readonly string[];
  retrievedAt: string;
}

export function createCostObservation(input: CreateCostObservationInput): CostObservation {
  const unknown = input.amount === null || !Number.isFinite(input.amount);
  return {
    id: input.id,
    tenantId: input.tenantId,
    provider: input.provider,
    amount: unknown ? null : input.amount,
    currency: unknown ? undefined : input.currency,
    unknown,
    period: input.period,
    evidenceIds: input.evidenceIds,
    retrievedAt: input.retrievedAt,
  };
}

export function refuseEstimatedCost(_estimated: number): never {
  throw new Error("cost_estimation_forbidden");
}
