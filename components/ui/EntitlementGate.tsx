"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./Card";
import { Button } from "./Button";
import { isActivePaidSubscription } from "@/lib/billing/plan-state";
import { hasCapability, isPlanTier, SELF_SERVICE_PLAN_TIERS, getPlanDefinition, type PlanCapabilities } from "@stratxcel/payments-and-wallet";

/**
 * Catalog-derived, not hardcoded: the cheapest active self-service plan
 * that actually includes this capability, per PLAN_DEFINITIONS. Powers the
 * "?recommended=" highlight on /app/billing (see app/app/billing/page.tsx)
 * the same way the old `minTier` prop did, but without pinning this
 * component to one specific plan name -- if the catalog's pricing or
 * capability assignment changes, this recommendation moves with it.
 */
function cheapestPlanWithCapability(capability: keyof PlanCapabilities): string | null {
  let best: { tier: string; priceCents: number } | null = null;
  for (const tier of SELF_SERVICE_PLAN_TIERS) {
    const def = getPlanDefinition(tier);
    if (!hasCapability(tier, capability) || def.priceCents == null) continue;
    if (!best || def.priceCents < best.priceCents) best = { tier, priceCents: def.priceCents };
  }
  return best?.tier ?? null;
}

interface SubscriptionLike {
  status: string;
  plan_tier: string;
}

/**
 * Presentational plan gate — no new business logic, just a read of the
 * tenant's existing subscription (GET /api/platform/subscriptions, the same
 * endpoint the Billing page and the header plan badge already use) so a
 * feature can honestly say "this needs a capability" instead of being
 * silently available to everyone.
 *
 * Real, confirmed defect fixed here (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
 * Update 15): this used to take a `minTier: "starter" | "growth" | "business"`
 * prop and rank it against a small hardcoded TIER_RANK map -- a second,
 * competing tier vocabulary that only knew about pre-v3-catalog legacy
 * tiers. It had no entry at all for any real, currently-sold plan
 * (seo, social, seo_and_social, advanced_seo, advanced_social,
 * advanced_growth, website_*), so `TIER_RANK[tier] ?? 0` silently fell
 * back to 0 (the same rank as `free`) for every one of them -- denying
 * access to every real paying customer regardless of what they actually
 * bought. Confirmed live: the real StratXcel tenant's active
 * `advanced_growth` subscription (which the header badge, powered by the
 * same canonical `getPlanDefinition`, correctly displays as "Advanced
 * Growth") was being shown "Upgrade to unlock Google SEO workflows".
 *
 * Fixed by gating on a named capability flag from the one real canonical
 * catalog (`PLAN_CAPABILITIES` in packages/payments-and-wallet/src/entitlements.ts
 * -- the same source `resolveCustomerPlanSummary` / the header badge and
 * `plans.ts`'s `PLAN_DEFINITIONS` already treat as authoritative, and
 * already covered by packages/payments-and-wallet/src/__tests__/plans.test.ts)
 * instead of a second, hand-maintained tier ranking. No plan/tier name is
 * special-cased here -- whichever tiers the catalog marks `true` for a
 * given capability unlock it, automatically, for every current and future
 * plan.
 */
export function EntitlementGate({
  tenantId,
  requiredCapability,
  featureName,
  reason,
  children,
}: {
  tenantId: string | undefined;
  /** The PLAN_CAPABILITIES flag that must be true for this feature to unlock. */
  requiredCapability: keyof PlanCapabilities;
  /** Shown in the upgrade prompt, e.g. "Google SEO workflows". */
  featureName: string;
  /** Optional personalized "why you need this" line, e.g. from an audit recommendation — brief §13. Falls back to a generic message when omitted. */
  reason?: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<"loading" | "unlocked" | "locked">("loading");

  useEffect(() => {
    let current = true;
    if (!tenantId) return;
    (async () => {
      try {
        const res = await fetch(`/api/platform/subscriptions?tenantId=${encodeURIComponent(tenantId)}`);
        const body = (await res.json()) as { subscription: SubscriptionLike | null };
        if (!current) return;
        const activePaid = isActivePaidSubscription(body.subscription);
        const tier = activePaid && isPlanTier(body.subscription!.plan_tier) ? body.subscription!.plan_tier : "free";
        setState(hasCapability(tier, requiredCapability) ? "unlocked" : "locked");
      } catch {
        if (current) setState("locked");
      }
    })();
    return () => {
      current = false;
    };
  }, [tenantId, requiredCapability]);

  if (state === "loading") return null;
  if (state === "unlocked") return <>{children}</>;

  const recommended = cheapestPlanWithCapability(requiredCapability);

  return (
    <Card className="border-sx-accent/30 p-6 text-center">
      <p className="text-base font-semibold text-sx-text">Upgrade to unlock {featureName}</p>
      <p className="mt-1.5 text-sm text-sx-text-muted">
        {reason ?? `${featureName} is not included on your current plan.`}
      </p>
      <Link href={recommended ? `/app/billing?recommended=${recommended}` : "/app/billing"} className="mt-4 inline-block">
        <Button variant="primary" size="cta">View plans</Button>
      </Link>
    </Card>
  );
}
