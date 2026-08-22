"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { isActivePaidSubscription } from "@/lib/billing/plan-state";
import { loadCustomerJson } from "@/lib/customer-app/load-result";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { PRICING_TIERS } from "@/lib/commercial/catalog";

interface EntitlementStatus {
  metric:
    | "social_posts"
    | "meta_ad_campaigns"
    | "whatsapp_contacts"
    | "website_maintenance"
    | "content_generation_monthly"
    | "automated_content_monthly";
  limit: number;
  currentUsage: number;
  remaining: number;
  isPaused: boolean;
  hasCapacity: boolean;
}

interface WalletAccount {
  tenant_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
}

interface Subscription {
  id: string;
  /** Canonical: free | starter | growth | business | scale. Historical rows may still carry launch | custom_growth (display-only; those tiers fail closed for new payments). */
  plan_tier: string;
  price_cents: number;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan_tier: string | null;
  grace_period_end: string | null;
  billing_provider?: string | null;
  provider_status?: string | null;
  provider_short_url?: string | null;
  next_charge_at?: string | null;
  last_charged_at?: string | null;
}

interface PriceBreakdown {
  totalCents: number;
  taxableValueCents: number;
  gstCents: number;
  ratePercent: number;
}

interface PlanDefinition {
  publicName: string;
  billingIntervalMonths: number;
  entitlements: {
    social_posts: number;
    meta_ad_campaigns: number;
    whatsapp_contacts: number;
    website_maintenance: number;
    content_generation_monthly: number;
    automated_content_monthly: number;
  };
  capabilities?: {
    google_growth_level: "basic" | "advanced" | "maximum";
    social_autopilot: boolean;
    landing_page: boolean;
    website_included: boolean;
    website_commitment_months: number;
    whatsapp_assistant_access: boolean;
  };
}

interface BillingProfile {
  legal_business_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  billing_state: string | null;
  pin_code: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  total_cents: number;
  taxable_value_cents: number;
  gst_cents: number;
  status: string;
  created_at: string;
}

function money(cents: number) {
  return `₹${(cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const STATUS_CHIP: Record<string, { state: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  active: { state: "success", label: "Active" },
  pending_payment: { state: "warning", label: "Awaiting authorization" },
  past_due: { state: "danger", label: "Payment issue" },
  paused: { state: "warning", label: "Paused" },
  cancelled: { state: "neutral", label: "Cancelled" },
  expired: { state: "neutral", label: "Expired" },
  payment_failed: { state: "danger", label: "Payment failed" },
  refunded: { state: "neutral", label: "Refunded" },
};

function isAutoPay(sub: Subscription) {
  return sub.billing_provider === "razorpay_subscription";
}

/**
 * The exact three self-service packages, sourced from the single shared
 * catalog (lib/commercial/catalog.ts) the public /pricing page also reads —
 * same positioning line, price, and feature bullets everywhere, no drift
 * between what a prospect sees pre-signup and what a customer sees here.
 * Price comes straight off the catalog's priceCents field (mirrors
 * packages/payments-and-wallet/src/plans.ts) rather than a second literal map.
 */
const SELF_SERVICE_PLANS = PRICING_TIERS.filter(
  (t): t is typeof PRICING_TIERS[number] & { planKey: "starter" | "growth" | "business"; priceCents: number } =>
    (t.planKey === "starter" || t.planKey === "growth" || t.planKey === "business") && t.priceCents != null
).map((t) => ({
  tier: t.planKey,
  name: t.name,
  priceCents: t.priceCents,
  pitch: t.pitch,
  whoItsFor: t.whoItsFor,
  scope: t.scope,
  popular: t.popular,
}));

const SCALE_TIER = PRICING_TIERS.find((t) => t.planKey === "scale");

export default function BillingPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recommendedTier, setRecommendedTier] = useState<string | null>(null);
  const loadSequence = useRef(0);

  // Deep-linked from EntitlementGate / the Growth Assistant / the audit
  // recommendation (brief §13) — "?recommended=growth" highlights that plan
  // with why it's needed instead of a flat, unexplained grid.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecommendedTier(new URLSearchParams(window.location.search).get("recommended"));
  }, []);
  const [profileForm, setProfileForm] = useState<BillingProfile>({
    legal_business_name: "",
    gstin: "",
    billing_address: "",
    billing_state: "",
    pin_code: "",
  });
  const hasActivePaidPlan = isActivePaidSubscription(subscription);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setWalletError(null);
    setAccount(null);
    setSubscription(null);
    setPriceBreakdown(null);
    setPlanDefinition(null);
    setPaymentUrl(null);
    setBillingProfile(null);
    setInvoices([]);
    setEntitlements([]);
    try {
      const [walletResult, subscriptionResult, entitlementResult] = await Promise.all([
        loadCustomerJson<{ account: WalletAccount | null }>(
          () => fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId)}`),
          "We couldn't load your wallet. Please try again."
        ),
        loadCustomerJson<{
          subscription: Subscription | null;
          planDefinition: PlanDefinition;
          priceBreakdown: PriceBreakdown | null;
          paymentUrl: string | null;
          billingProfile: BillingProfile | null;
          invoices?: Invoice[];
        }>(
          () => fetch(`/api/platform/subscriptions?tenantId=${encodeURIComponent(tenantId)}`),
          "We couldn't load your billing details. Please try again."
        ),
        loadCustomerJson<{ entitlements: EntitlementStatus[] }>(
          () => fetch(`/api/platform/entitlements?tenantId=${encodeURIComponent(tenantId)}`),
          "We couldn't load your usage. Please try again."
        ),
      ]);
      if (requestId !== loadSequence.current) return;
      if (subscriptionResult.status === "error") {
        setError(subscriptionResult.message);
        return;
      }
      if (walletResult.status === "error") setWalletError(walletResult.message);
      else setAccount(walletResult.data.account);
      setSubscription(subscriptionResult.data.subscription);
      setPlanDefinition(subscriptionResult.data.planDefinition);
      setPriceBreakdown(subscriptionResult.data.priceBreakdown);
      setPaymentUrl(subscriptionResult.data.paymentUrl);
      setBillingProfile(subscriptionResult.data.billingProfile);
      setInvoices(subscriptionResult.data.invoices ?? []);
      // Usage is a nice-to-have display, not blocking — a failure here never
      // surfaces the page-level error state, it just leaves the credits
      // card showing plan defaults instead of live usage.
      if (entitlementResult.status === "success") setEntitlements(entitlementResult.data.entitlements ?? []);
      if (subscriptionResult.data.billingProfile) {
        setProfileForm({
          legal_business_name: subscriptionResult.data.billingProfile.legal_business_name ?? "",
          gstin: subscriptionResult.data.billingProfile.gstin ?? "",
          billing_address: subscriptionResult.data.billingProfile.billing_address ?? "",
          billing_state: subscriptionResult.data.billingProfile.billing_state ?? "",
          pin_code: subscriptionResult.data.billingProfile.pin_code ?? "",
        });
      }
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setCancellation(cancel: boolean) {
    if (!tenantId || !subscription) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/subscriptions/${subscription.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, cancel }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not update cancellation.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(targetPlanTier: "starter" | "growth" | "business") {
    if (!tenantId || !subscription) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/subscriptions/${subscription.id}/change-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, targetPlanTier }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not schedule plan change.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveBillingProfile() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, ...profileForm }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not save GST invoice details.");
        return;
      }
      setNotice("GST invoice details saved.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Billing" tenantName={active?.name} description="Your current plan, included capabilities, wallet, and payment history." />

      {error && <ErrorState message={error} onRetry={load} />}
      {notice && (
        <div className="rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-2.5 text-[12.5px] text-sx-text">{notice}</div>
      )}
      {loading && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {/* Current Plan — StratXcel App reference gradient hero treatment for an active paid plan; the Free state keeps the existing upgrade-focused card since the reference doesn't specify a "no plan" composition. */}
      {!loading && !error && hasActivePaidPlan && subscription && (
        <div
          className="rounded-sx-md p-5"
          style={{ background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/70">Current Plan</p>
          <p className="mt-1.5 text-[22px] font-bold capitalize text-white">{subscription.plan_tier.replace("_", " ")} Plan</p>
          {priceBreakdown && (
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold text-white">{money(priceBreakdown.totalCents)}</span>
              <span className="text-sm text-white/70">/ month</span>
            </div>
          )}
          {(subscription.next_charge_at || subscription.current_period_end) && (
            <p className="mt-1.5 text-[13px] text-white/70">
              Next billing: {new Date((subscription.next_charge_at ?? subscription.current_period_end)!).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Subscription plan & status */}
      {!loading && !error && <Card className="border-sx-accent/25 p-6">
        {!hasActivePaidPlan && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sx-accent">Current plan</p>
            <h2 className="mt-1 font-sx-sans text-2xl font-semibold text-sx-text">Free</h2>
          </>
        )}

        {!hasActivePaidPlan && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="max-w-2xl text-sm leading-6 text-sx-text-muted" title="Free">
              No active paid plan. Your Audit and saved business context remain available. Pick a plan below when you want ongoing execution and recurring improvement.
            </p>
            {subscription && subscription.status !== "active" && (
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3">
                <p className="text-xs font-semibold text-sx-text">Previous payment attempt: {STATUS_CHIP[subscription.status]?.label ?? subscription.status}</p>
                <p className="mt-1 text-xs text-sx-text-muted">This attempt does not activate a paid plan or paid entitlements.</p>
              </div>
            )}
            {recommendedTier && SELF_SERVICE_PLANS.some((p) => p.tier === recommendedTier) && (
              <div className="rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sx-accent">Recommended for you</p>
                <p className="mt-1 text-sm text-sx-text">
                  Based on what StratXcel found, the <span className="font-semibold capitalize">{recommendedTier}</span> plan is the smallest plan that covers what your business needs right now.
                </p>
              </div>
            )}
            {/* Mobile-first: one column, price -> who it's for -> what it gives -> CTA. Grows to 3 columns only once there's room. */}
            <div className="grid gap-4 sm:grid-cols-3">
              {SELF_SERVICE_PLANS.map((p) => (
                <div
                  key={p.tier}
                  className={`flex flex-col rounded-sx-md border p-4 ${p.tier === recommendedTier ? "border-sx-accent ring-2 ring-sx-accent/50" : p.popular ? "border-sx-accent ring-1 ring-sx-accent/40" : "border-sx-border"}`}
                >
                  {p.tier === recommendedTier ? (
                    <span className="mb-2 inline-flex w-fit items-center rounded-sx-xs bg-sx-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sx-accent-on">
                      Recommended
                    </span>
                  ) : p.popular && (
                    <span className="mb-2 inline-flex w-fit items-center rounded-sx-xs bg-sx-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sx-accent-on">
                      Most popular
                    </span>
                  )}
                  <p className="font-sx-sans text-lg font-extrabold text-sx-text">{money(p.priceCents)}<span className="text-xs font-normal text-sx-text-subtle">/mo</span></p>
                  <p className="text-[11px] text-sx-text-subtle">GST included</p>
                  <p className="mt-2 font-sx-sans text-sm font-bold text-sx-text">{p.name}</p>
                  <p className="mt-0.5 text-xs text-sx-text-muted">{p.pitch}</p>
                  <p className="mt-2 text-[11px] italic text-sx-text-subtle">{p.whoItsFor}</p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-xs text-sx-text-muted">
                    {p.scope.slice(0, 4).map((line) => (
                      <li key={line} className="flex gap-1.5">
                        <span className="text-sx-accent">✓</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/contact?intent=${p.tier}`}
                    className="mt-4 block rounded-sx-sm bg-sx-accent px-4 py-3 text-center text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Request {p.name} activation
                  </Link>
                </div>
              ))}
            </div>
            <p className="text-xs text-sx-text-subtle">
              {SCALE_TIER?.price ?? "Scale / Custom"}/mo and is scoped with our team for multi-location or high-volume needs.
            </p>
          </div>
        )}

        {subscription && hasActivePaidPlan && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-sx-sans text-base font-bold text-sx-text capitalize">{subscription.plan_tier.replace("_", " ")}</span>
              <StatusChip state={STATUS_CHIP[subscription.status]?.state ?? "neutral"}>
                {STATUS_CHIP[subscription.status]?.label ?? subscription.status}
              </StatusChip>
              {subscription.cancel_at_period_end && subscription.status === "active" && (
                <StatusChip state="warning">Cancels at period end</StatusChip>
              )}
              {subscription.pending_plan_tier && <StatusChip state="accent">Switching to {subscription.pending_plan_tier} next renewal</StatusChip>}
            </div>

            {priceBreakdown && (
              <div className="grid grid-cols-3 gap-3 rounded-sx-md border border-sx-border bg-sx-surface-2 p-3 text-xs">
                <div>
                  <p className="text-sx-text-subtle">Taxable value</p>
                  <p className="font-semibold text-sx-text">{money(priceBreakdown.taxableValueCents)}</p>
                </div>
                <div>
                  <p className="text-sx-text-subtle">GST @ {priceBreakdown.ratePercent}%</p>
                  <p className="font-semibold text-sx-text">{money(priceBreakdown.gstCents)}</p>
                </div>
                <div>
                  <p className="text-sx-text-subtle">Total payable</p>
                  <p className="font-semibold text-sx-text">{money(priceBreakdown.totalCents)}</p>
                </div>
              </div>
            )}

            {planDefinition && (
              <div>
                <p className="text-sm font-semibold text-sx-text">Included each month</p>
                <div className="mt-2 grid gap-2 text-sm text-sx-text-muted sm:grid-cols-2">
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">{planDefinition.entitlements.content_generation_monthly} image creations</p>
                  {planDefinition.entitlements.automated_content_monthly > 0 && (
                    <p className="rounded-sx-sm bg-sx-surface-2 p-3">+{planDefinition.entitlements.automated_content_monthly} StratXcel-researched creatives</p>
                  )}
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3 capitalize">{planDefinition.capabilities?.google_growth_level ?? "basic"} Google Growth</p>
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">
                    {planDefinition.capabilities?.social_autopilot ? "Social Autopilot included" : "Direct posting & scheduling (Social Autopilot not included)"}
                  </p>
                </div>
              </div>
            )}

            {isAutoPay(subscription) && (
              <p className="text-xs text-sx-text-subtle">
                AutoPay{subscription.provider_status ? ` · provider status: ${subscription.provider_status}` : ""}
                {subscription.next_charge_at ? ` · next charge ${new Date(subscription.next_charge_at).toLocaleDateString()}` : ""}
                {subscription.last_charged_at ? ` · last charged ${new Date(subscription.last_charged_at).toLocaleDateString()}` : ""}
              </p>
            )}

            {(subscription.next_charge_at || subscription.current_period_end) && (
              <p className="text-xs text-sx-text-muted">
                {subscription.status === "active" && !subscription.cancel_at_period_end
                  ? `Next charge ${new Date((subscription.next_charge_at ?? subscription.current_period_end)!).toLocaleDateString()}`
                  : `Access until ${new Date(subscription.current_period_end ?? subscription.next_charge_at!).toLocaleDateString()}`}
              </p>
            )}

            {subscription.status === "pending_payment" && paymentUrl && (
              <div className="rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 p-3">
                <p className="text-xs text-sx-text">
                  {isAutoPay(subscription)
                    ? "Authorize AutoPay once to activate this plan. Razorpay will charge the monthly amount automatically."
                    : "Complete payment to activate this plan."}
                </p>
                <a href={paymentUrl} className="mt-2 inline-block">
                  <Button variant="primary" size="sm">{isAutoPay(subscription) ? "Authorize AutoPay" : "Pay now"}</Button>
                </a>
              </div>
            )}

            {(subscription.status === "past_due" || subscription.provider_status === "halted") && (
              <div className="rounded-sx-md border border-[rgb(242_86_95_/_0.32)] bg-[rgb(242_86_95_/_0.06)] p-3">
                <p className="text-xs text-[#FF8A90]">
                  We couldn&apos;t collect your last payment
                  {subscription.provider_status === "halted" ? " (AutoPay halted)" : ""}. Your plan stays accessible until{" "}
                  {subscription.grace_period_end ? new Date(subscription.grace_period_end).toLocaleDateString() : "your grace period ends"}.
                </p>
                {paymentUrl ? (
                  <a href={paymentUrl} className="mt-2 inline-block">
                    <Button variant="danger" size="sm">{isAutoPay(subscription) ? "Recover AutoPay" : "Retry payment"}</Button>
                  </a>
                ) : (
                  <p className="mt-1 text-[11px] text-sx-text-subtle">
                    {isAutoPay(subscription)
                      ? "Waiting for Razorpay recovery — check back shortly or contact support."
                      : "A payment link is being generated — check back shortly."}
                  </p>
                )}
              </div>
            )}

            {subscription.status === "paused" && (
              <div className="rounded-sx-md border border-sx-border p-3">
                <p className="text-xs text-sx-text-muted">Subscription is paused at the payment provider. Access may be limited until AutoPay resumes.</p>
              </div>
            )}

            {subscription.status === "active" && (
              <div className="flex flex-wrap items-center gap-2">
                {!subscription.cancel_at_period_end ? (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setCancellation(true)}>
                    Cancel at period end
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setCancellation(false)}>
                    Keep subscription
                  </Button>
                )}
                {SELF_SERVICE_PLANS.filter((p) => p.tier !== subscription.plan_tier).map((p) => (
                  <Button key={p.tier} variant="ghost" size="sm" disabled={busy || !!subscription.pending_plan_tier} onClick={() => changePlan(p.tier)}>
                    Switch to {p.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>}

      {/* What you have — natural-language usage per brief §6 ("10 image creations this month, 8 remaining"), never "credits remaining" as the headline framing. */}
      {!loading && !error && hasActivePaidPlan && entitlements.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-sx-sans text-[17px] font-semibold text-sx-text">What you have</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {entitlements.find((e) => e.metric === "content_generation_monthly") && (() => {
              const e = entitlements.find((x) => x.metric === "content_generation_monthly")!;
              return (
                <div className="rounded-sx-sm bg-sx-surface-2 p-3.5">
                  <p className="text-sm font-semibold text-sx-text">{e.limit} image creations this month</p>
                  <p className="mt-0.5 text-xs text-sx-text-subtle">{e.remaining} remaining — posters, offers, and festival creatives.</p>
                </div>
              );
            })()}
            {entitlements.find((e) => e.metric === "automated_content_monthly" && e.limit > 0) && (() => {
              const e = entitlements.find((x) => x.metric === "automated_content_monthly")!;
              return (
                <div className="rounded-sx-sm bg-sx-surface-2 p-3.5">
                  <p className="text-sm font-semibold text-sx-text">{e.limit} researched creatives StratXcel makes for you</p>
                  <p className="mt-0.5 text-xs text-sx-text-subtle">{e.remaining} remaining this month — on top of what you request yourself.</p>
                </div>
              );
            })()}
            {entitlements.find((e) => e.metric === "website_maintenance") && (
              <div className="rounded-sx-sm bg-sx-surface-2 p-3.5">
                <p className="text-sm font-semibold text-sx-text">
                  {planDefinition?.capabilities?.website_included
                    ? "Professional website included"
                    : planDefinition?.capabilities?.landing_page
                      ? "Landing page included"
                      : "Website not included — available as an add-on"}
                </p>
                <p className="mt-0.5 text-xs text-sx-text-subtle">Hosting and upkeep for your site.</p>
              </div>
            )}
            {planDefinition?.capabilities && (
              <div className="rounded-sx-sm bg-sx-surface-2 p-3.5">
                <p className="text-sm font-semibold text-sx-text capitalize">{planDefinition.capabilities.google_growth_level} Google Growth</p>
                <p className="mt-0.5 text-xs text-sx-text-subtle">Google Business optimization, local SEO, and review monitoring.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* What your plan unlocks — outcome-based, not a feature matrix. No CRM/lead-capture card: not part of this offer. */}
      {!loading && !error && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-sx-sans text-[17px] font-semibold text-sx-text">What your plan unlocks</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <UnlockCard
              title="Content creation & publishing"
              items={["Posters", "Festival creatives", "Offers", "Hindi + English", "Direct posting & scheduling"]}
              unlocked={hasActivePaidPlan}
            />
            <UnlockCard
              title="Social Autopilot"
              items={["Research", "Plan", "Create", "Schedule", "Publish", "Analyze"]}
              unlocked={Boolean(planDefinition?.capabilities?.social_autopilot)}
            />
            <UnlockCard
              title="Google Growth"
              items={["Google Business optimization", "Local SEO", "Competitor research"]}
              unlocked={hasActivePaidPlan}
            />
            <UnlockCard
              title="Website"
              items={planDefinition?.capabilities?.website_included
                ? ["Professional website included", `${planDefinition.capabilities.website_commitment_months}-month commitment`]
                : planDefinition?.capabilities?.landing_page
                  ? ["High-quality landing page included"]
                  : ["Available as a separate add-on"]}
              unlocked={Boolean(planDefinition?.capabilities?.website_included || planDefinition?.capabilities?.landing_page)}
            />
          </div>
        </Card>
      )}

      {!loading && !error && (
        <Card className="p-6">
          <h2 className="font-sx-sans text-base font-semibold text-sx-text">Managed AI wallet</h2>
          <p className="mt-1 text-xs text-sx-text-subtle">
            Separate from your monthly plan above — this wallet is only spent when you run paid Meta or Google ads on your behalf.
          </p>
          {walletError ? (
            <div className="mt-3"><ErrorState message={walletError} onRetry={load} /></div>
          ) : account ? (
            <div className="mt-3">
              <Metric
                label="Ad wallet balance"
                value={`${account.currency} ${(account.balance_cents / 100).toFixed(2)}`}
                deltaLabel={`last updated ${new Date(account.updated_at).toLocaleString()}`}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-sx-text-muted">No wallet information is available.</p>
          )}
        </Card>
      )}

      {/* GST invoice details */}
      {!loading && !error && <Card className="p-5 sm:p-6">
        <h2 className="font-sx-sans text-[17px] font-semibold text-sx-text">GST invoice details</h2>
        <p className="mt-1 text-sm text-sx-text-subtle">Optional — used only to print on your invoices. GST is already included in every price shown above.</p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <BillingField
            label="Legal business name"
            value={profileForm.legal_business_name ?? ""}
            onChange={(v) => setProfileForm((f) => ({ ...f, legal_business_name: v }))}
          />
          <BillingField
            label="GSTIN"
            value={profileForm.gstin ?? ""}
            onChange={(v) => setProfileForm((f) => ({ ...f, gstin: v }))}
          />
          <BillingField
            label="Billing address"
            value={profileForm.billing_address ?? ""}
            onChange={(v) => setProfileForm((f) => ({ ...f, billing_address: v }))}
            className="sm:col-span-2"
          />
          <BillingField
            label="State"
            value={profileForm.billing_state ?? ""}
            onChange={(v) => setProfileForm((f) => ({ ...f, billing_state: v }))}
          />
          <BillingField
            label="PIN code"
            value={profileForm.pin_code ?? ""}
            onChange={(v) => setProfileForm((f) => ({ ...f, pin_code: v }))}
          />
        </div>
        <Button className="mt-4" variant="primary" size="cta" disabled={busy} onClick={saveBillingProfile}>
          Save GST details
        </Button>
      </Card>}

      {/* Invoices — mobile-first row cards, not a desktop data table */}
      {!loading && !error && <Card className="p-5 sm:p-6">
        <h2 className="font-sx-sans text-[17px] font-semibold text-sx-text">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No invoices yet" subtitle="Invoices appear here automatically after each payment." />
          </div>
        ) : (
          <div className="mt-3 flex flex-col">
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                className={`flex items-center justify-between gap-3 py-3.5 ${idx === 0 ? "" : "border-t border-sx-border"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-sx-text">
                    {money(inv.total_cents)} <span className="font-normal text-sx-text-muted">· {inv.invoice_type.replace("_", " ")}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-sx-text-subtle">
                    {new Date(inv.created_at).toLocaleDateString()} · {inv.invoice_number} · GST {money(inv.gst_cents)}
                  </p>
                </div>
                <StatusChip state={inv.status === "paid" || inv.status === "issued" ? "success" : "neutral"} className="shrink-0 capitalize">
                  {inv.status}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </Card>}
    </div>
  );
}

/** One outcome card in "What your plan unlocks" — locked cards link to the plan grid above instead of hiding the capability entirely, so a Free/Starter user can see what upgrading actually gives them. */
function UnlockCard({ title, items, unlocked }: { title: string; items: string[]; unlocked: boolean }) {
  return (
    <div className={`rounded-sx-sm border p-3.5 ${unlocked ? "border-sx-border bg-sx-surface-2" : "border-sx-border bg-sx-surface-1 opacity-70"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sx-text">{title}</p>
        {!unlocked && <StatusChip state="neutral">Locked</StatusChip>}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sx-text-muted">
        {items.map((item) => (
          <li key={item}>{unlocked ? "✓" : "·"} {item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Labeled input matching the customer app's touch-friendly field sizing (spec §5.1) — used only on this page since Billing is the one surface here still collecting free-text profile data. */
function BillingField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-sx-text-muted">{label}</span>
      <input
        className="h-11 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3.5 text-[15px] text-sx-text outline-none transition-colors focus-visible:border-sx-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
