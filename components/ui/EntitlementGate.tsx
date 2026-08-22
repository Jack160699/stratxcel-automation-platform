"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./Card";
import { Button } from "./Button";
import { isActivePaidSubscription } from "@/lib/billing/plan-state";

type RequiredTier = "starter" | "growth" | "business";

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2, business: 3, scale: 3 };

interface SubscriptionLike {
  status: string;
  plan_tier: string;
}

/**
 * Presentational plan gate — no new business logic, just a read of the
 * tenant's existing subscription (GET /api/platform/subscriptions, the same
 * endpoint the Billing page already uses) so a feature can honestly say
 * "this needs plan X" instead of being silently available to everyone.
 * Used to satisfy "SEO should activate only with the appropriate paid
 * entitlement" without touching the gated feature's own logic.
 */
export function EntitlementGate({
  tenantId,
  minTier,
  featureName,
  reason,
  children,
}: {
  tenantId: string | undefined;
  /** Lowest plan tier that unlocks this feature. */
  minTier: RequiredTier;
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
        const tier = activePaid ? body.subscription!.plan_tier : "free";
        setState((TIER_RANK[tier] ?? 0) >= TIER_RANK[minTier] ? "unlocked" : "locked");
      } catch {
        if (current) setState("locked");
      }
    })();
    return () => {
      current = false;
    };
  }, [tenantId, minTier]);

  if (state === "loading") return null;
  if (state === "unlocked") return <>{children}</>;

  return (
    <Card className="border-sx-accent/30 p-6 text-center">
      <p className="text-base font-semibold text-sx-text">Upgrade to unlock {featureName}</p>
      <p className="mt-1.5 text-sm text-sx-text-muted">
        {reason ?? `${featureName} is included from the ${minTier[0].toUpperCase() + minTier.slice(1)} plan onward.`}
      </p>
      <Link href={`/app/billing?recommended=${minTier}`} className="mt-4 inline-block">
        <Button variant="primary" size="cta">View plans</Button>
      </Link>
    </Card>
  );
}
