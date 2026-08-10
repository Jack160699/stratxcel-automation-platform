import type { ServiceClient } from "../db.ts";
import { getIntegrationMode, getRazorpayCredentials, isPaymentFeatureEnabled } from "../flags.ts";
import { getSelfServicePlan, type PlanTier } from "../plans.ts";
import { IntegrationDisabledError } from "./adapter.ts";
import { getRazorpayRecurringPlanId } from "./recurring-plans.ts";

export interface CreateRazorpaySubscriptionInput {
  tenantId: string;
  subscriptionId: string;
  planTier: PlanTier;
  /** Optional customer contact for Razorpay customer object */
  customerContact?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  totalCount?: number;
}

export interface CreateRazorpaySubscriptionResult {
  providerSubscriptionId: string;
  providerPlanId: string;
  shortUrl: string | null;
  providerStatus: string;
  mode: "shadow" | "test" | "live";
}

function authHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/**
 * Creates a Razorpay Subscription for AutoPay. Plan ID and amount are always
 * resolved server-side from the canonical catalog — never from client input.
 * Gated by PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED (fail-closed) and
 * RAZORPAY_INTEGRATION_MODE.
 */
export async function createRazorpaySubscription(
  _supabase: ServiceClient,
  input: CreateRazorpaySubscriptionInput
): Promise<CreateRazorpaySubscriptionResult> {
  if (!isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED")) {
    throw new Error("Recurring subscriptions are disabled (PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED)");
  }

  const plan = getSelfServicePlan(input.planTier);
  if (!plan) {
    throw new Error(`Plan ${input.planTier} is not available for recurring self-checkout`);
  }

  const providerPlanId = getRazorpayRecurringPlanId(input.planTier);
  if (!providerPlanId) {
    throw new Error(`No Razorpay recurring plan mapped for tier ${input.planTier}`);
  }

  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");

  if (mode === "shadow") {
    const shadowId = `sub_shadow_${input.subscriptionId.replace(/-/g, "").slice(0, 20)}`;
    return {
      providerSubscriptionId: shadowId,
      providerPlanId,
      shortUrl: `https://shadow.razorpay.local/v1/subscriptions/${shadowId}/auth`,
      providerStatus: "created",
      mode: "shadow",
    };
  }

  const { keyId, keySecret } = getRazorpayCredentials(mode)!;
  const totalCount = input.totalCount && input.totalCount > 0 ? input.totalCount : 120;

  const body: Record<string, unknown> = {
    plan_id: providerPlanId,
    total_count: totalCount,
    customer_notify: 1,
    notes: {
      tenant_id: input.tenantId,
      subscription_id: input.subscriptionId,
      plan_tier: input.planTier,
      payment_purpose: "subscription_payment",
    },
  };

  if (input.customerContact || input.customerEmail || input.customerName) {
    body.customer = {
      ...(input.customerName ? { name: input.customerName } : {}),
      ...(input.customerEmail ? { email: input.customerEmail } : {}),
      ...(input.customerContact ? { contact: input.customerContact } : {}),
    };
  }

  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: authHeader(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Razorpay subscription create failed: HTTP ${response.status} ${errText.slice(0, 300)}`);
  }

  const result = (await response.json()) as {
    id: string;
    plan_id?: string;
    short_url?: string;
    status?: string;
  };

  if (!result.id) throw new Error("Razorpay subscription create returned no id");

  return {
    providerSubscriptionId: result.id,
    providerPlanId: result.plan_id ?? providerPlanId,
    shortUrl: result.short_url ?? null,
    providerStatus: result.status ?? "created",
    mode,
  };
}

export async function cancelRazorpaySubscriptionAtPeriodEnd(
  providerSubscriptionId: string,
  cancelAtCycleEnd = true
): Promise<{ providerStatus: string }> {
  if (!isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED")) {
    throw new Error("Recurring subscriptions are disabled");
  }

  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");
  if (mode === "shadow") return { providerStatus: cancelAtCycleEnd ? "active" : "cancelled" };

  const { keyId, keySecret } = getRazorpayCredentials(mode)!;
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Razorpay subscription cancel failed: HTTP ${response.status} ${errText.slice(0, 300)}`);
  }

  const result = (await response.json()) as { status?: string };
  return { providerStatus: result.status ?? (cancelAtCycleEnd ? "active" : "cancelled") };
}

/**
 * Schedules a plan change by updating the Razorpay subscription's plan_id.
 * Amount remains provider-plan-controlled; we only allow mapped self-service tiers.
 */
export async function updateRazorpaySubscriptionPlan(
  providerSubscriptionId: string,
  planTier: PlanTier
): Promise<{ providerPlanId: string; providerStatus: string }> {
  if (!isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED")) {
    throw new Error("Recurring subscriptions are disabled");
  }

  const providerPlanId = getRazorpayRecurringPlanId(planTier);
  if (!providerPlanId) throw new Error(`No Razorpay recurring plan mapped for tier ${planTier}`);

  const mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  if (mode === "disabled") throw new IntegrationDisabledError("Razorpay");
  if (mode === "shadow") return { providerPlanId, providerStatus: "active" };

  const { keyId, keySecret } = getRazorpayCredentials(mode)!;
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: authHeader(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan_id: providerPlanId, schedule_change_at: "cycle_end" }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Razorpay subscription plan update failed: HTTP ${response.status} ${errText.slice(0, 300)}`);
  }

  const result = (await response.json()) as { plan_id?: string; status?: string };
  return { providerPlanId: result.plan_id ?? providerPlanId, providerStatus: result.status ?? "active" };
}

export function isProviderManagedSubscription(sub: {
  billing_provider?: string | null;
  provider_subscription_id?: string | null;
}): boolean {
  return sub.billing_provider === "razorpay_subscription" && Boolean(sub.provider_subscription_id);
}
