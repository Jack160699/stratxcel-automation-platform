export interface SubscriptionStateLike {
  status: string;
  plan_tier: string;
}

/** Membership and checkout attempts never prove paid access; only a fulfilled active subscription does. */
export function isActivePaidSubscription(subscription: SubscriptionStateLike | null | undefined): boolean {
  return Boolean(subscription && subscription.status === "active" && subscription.plan_tier !== "free");
}
