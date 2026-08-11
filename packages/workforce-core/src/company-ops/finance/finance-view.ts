import type { MissionBudgetEnvelope } from "../../budgets/hierarchy.ts";
import type { BusinessGrowthEntitlementSnapshot } from "../../planning/types.ts";
import { evaluateEntitlementHealth, isPlanExhausted } from "./entitlement-health.ts";
import type {
  FinanceChargeAttempt,
  FinanceSnapshot,
  PaymentFailureSurface,
  PaymentState,
} from "../types.ts";

export class FinanceChargeDeniedError extends Error {
  readonly code = "finance_charge_denied";
  constructor(message = "Finance department has chargingAuthority NONE — cannot charge customers") {
    super(message);
    this.name = "FinanceChargeDeniedError";
  }
}

/**
 * Finance snapshot — consumes billing truth; never charges.
 */
export function buildFinanceSnapshot(input: {
  tenantId: string;
  entitlementSnapshot: BusinessGrowthEntitlementSnapshot;
  paymentState: PaymentState;
  budget: MissionBudgetEnvelope;
  providerReportedCents?: number | null;
}): FinanceSnapshot {
  const entitlementHealth = evaluateEntitlementHealth(input.entitlementSnapshot, input.paymentState);
  const usage: Record<string, number> = { ...(input.entitlementSnapshot.currentUsage ?? {}) };
  const remaining: Record<string, number> = {};
  for (const [metric, limit] of Object.entries(input.entitlementSnapshot.relevantEntitlements ?? {})) {
    const used = usage[metric] ?? 0;
    remaining[metric] =
      input.entitlementSnapshot.remainingUsage?.[metric] ?? Math.max(0, (limit as number) - used);
  }

  const providerReported =
    input.providerReportedCents == null || !Number.isFinite(input.providerReportedCents)
      ? ({ known: false, cents: null, reason: "provider_not_reported" } as const)
      : ({ known: true, cents: input.providerReportedCents } as const);

  return {
    tenantId: input.tenantId,
    subscriptionId: input.entitlementSnapshot.subscriptionId ?? null,
    planTier: input.entitlementSnapshot.planTier ?? null,
    paymentState: input.paymentState,
    entitlementHealth,
    usage,
    remaining,
    reservedBudgetCents: input.budget.reservedCents,
    providerReportedCost: providerReported,
    planExhausted: isPlanExhausted(entitlementHealth),
    overageEligibility: "NONE",
    chargingAuthority: "NONE",
    canAutonomouslyCharge: false,
  };
}

/** Never mutates — chargingAuthority is always NONE. */
export function attemptFinanceCharge(_input: {
  tenantId: string;
  amountCents: number;
  reason: string;
}): FinanceChargeAttempt {
  return {
    charged: false,
    mutated: false,
    reason: "charging_authority_none",
    chargingAuthority: "NONE",
  };
}

export function assertFinanceCannotCharge(): never {
  throw new FinanceChargeDeniedError();
}

/** Surface payment failure without performing customer-visible mutation. */
export function surfacePaymentFailure(paymentState: PaymentState): PaymentFailureSurface {
  return {
    paymentState,
    mutated: false,
    customerVisibleMutation: false,
    message:
      paymentState === "failed" || paymentState === "past_due"
        ? "Payment failure surfaced for recovery — no charge attempted"
        : `Payment state ${paymentState} recorded without mutation`,
  };
}
