import { getPlanDefinition, isPlanTier, type PlanTier } from "@stratxcel/payments-and-wallet";
import { isActivePaidSubscription } from "./plan-state.ts";

export interface CustomerPlanSummary {
  tier: PlanTier;
  name: string;
  status: string;
  billingStatus: string;
  billingCycle: "Monthly" | null;
  nextRenewalAt: string | null;
  priceCents: number | null;
  activePaid: boolean;
}

export interface SubscriptionPlanRow {
  plan_tier?: unknown;
  status?: unknown;
  provider_status?: unknown;
  current_period_end?: unknown;
  next_charge_at?: unknown;
  price_cents?: unknown;
}

/** Converts persisted subscription truth into the small customer-facing plan DTO used across the shell. */
export function resolveCustomerPlanSummary(subscription: SubscriptionPlanRow | null | undefined): CustomerPlanSummary {
  const persistedTier = isPlanTier(subscription?.plan_tier) ? subscription.plan_tier : "free";
  const status = typeof subscription?.status === "string" ? subscription.status : "free";
  const activePaid = isActivePaidSubscription({ status, plan_tier: persistedTier });
  const tier = activePaid ? persistedTier : "free";
  const definition = getPlanDefinition(tier);
  const providerStatus = typeof subscription?.provider_status === "string" ? subscription.provider_status : null;
  const renewal =
    typeof subscription?.next_charge_at === "string"
      ? subscription.next_charge_at
      : typeof subscription?.current_period_end === "string"
        ? subscription.current_period_end
        : null;

  return {
    tier,
    name: definition.publicName,
    status: activePaid ? "Active" : status === "free" ? "Free" : humanize(status),
    billingStatus: providerStatus ? humanize(providerStatus) : activePaid ? "Active" : "No active subscription",
    billingCycle: activePaid ? "Monthly" : null,
    nextRenewalAt: activePaid ? renewal : null,
    priceCents: typeof subscription?.price_cents === "number" ? subscription.price_cents : definition.priceCents,
    activePaid,
  };
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
