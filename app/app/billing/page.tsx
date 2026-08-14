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

const SELF_SERVICE_PLANS: Array<{ tier: "starter" | "growth" | "business"; name: string; priceCents: number; blurb: string }> = [
  { tier: "starter", name: "Starter", priceCents: 499_900, blurb: "A complete entry system for one small or local business." },
  { tier: "growth", name: "Growth", priceCents: 999_900, blurb: "The serious SMB plan for recurring execution and follow-up." },
  { tier: "business", name: "Business", priceCents: 1_999_900, blurb: "Advanced Search, CRM, publishing, ads support, and priority execution." },
];

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
  const [error, setError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadSequence = useRef(0);
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
    try {
      const [walletResult, subscriptionResult] = await Promise.all([
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

      {/* Subscription plan & status */}
      {!loading && !error && <Card className="border-sx-accent/25 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sx-accent">Current plan</p>
        <h2 className="mt-1 font-sx-sans text-2xl font-semibold text-sx-text">
          {hasActivePaidPlan && subscription ? `You’re on ${subscription.plan_tier.replace("_", " ")}` : "Free"}
        </h2>

        {!hasActivePaidPlan && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="max-w-2xl text-sm leading-6 text-sx-text-muted" title="Free">
              No active paid plan. Your Audit and saved business context remain available. Start Growth when you want ongoing execution, Copilot-led planning, and recurring improvement.
            </p>
            <div className="rounded-sx-md border border-sx-accent/30 bg-sx-accent/10 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-sx-text">Start Growth</p>
                  <p className="mt-1 text-sm text-sx-text-muted">Best for Audit-led businesses ready to turn findings into ongoing action.</p>
                  <p className="mt-2 text-sm font-semibold text-sx-text">{money(999_900)}/month <span className="font-normal text-sx-text-muted">· GST included</span></p>
                </div>
                <Link href="/contact?intent=growth" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent px-5 text-sm font-bold text-sx-accent-on">
                  Request Growth activation
                </Link>
              </div>
              <ul className="mt-4 grid gap-2 text-sm text-sx-text-muted sm:grid-cols-2">
                <li>✓ Ongoing growth missions</li>
                <li>✓ Copilot planning and execution</li>
                <li>✓ Managed AI capacity</li>
                <li>✓ Business connector support</li>
              </ul>
            </div>
            {subscription && subscription.status !== "active" && (
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3">
                <p className="text-xs font-semibold text-sx-text">Previous payment attempt: {STATUS_CHIP[subscription.status]?.label ?? subscription.status}</p>
                <p className="mt-1 text-xs text-sx-text-muted">This attempt does not activate a paid plan or paid entitlements.</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {SELF_SERVICE_PLANS.map((p) => (
                <div key={p.tier} className="rounded-sx-md border border-sx-border p-4">
                  <p className="font-sx-sans text-sm font-bold text-sx-text">{p.name}</p>
                  <p className="mt-1 font-sx-sans text-lg font-extrabold text-sx-text">{money(p.priceCents)}/mo</p>
                  <p className="text-[11px] text-sx-text-subtle">GST included</p>
                  <p className="mt-2 text-xs text-sx-text-muted">{p.blurb}</p>
                  <Link
                    href={`/contact?intent=${p.tier}`}
                    className="mt-3 block rounded-sx-sm bg-sx-accent px-4 py-2.5 text-center text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Request {p.name} activation
                  </Link>
                </div>
              ))}
            </div>
            <p className="text-xs text-sx-text-subtle">
              Scale / Custom starts at {money(3_499_900)}/mo and is scoped with our team. Recurring production subscriptions are not enabled in this environment — request activation rather than charging a live monthly plan here.
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
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">{planDefinition.entitlements.social_posts} social posts</p>
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">{planDefinition.entitlements.meta_ad_campaigns} Meta ad campaigns</p>
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">{planDefinition.entitlements.whatsapp_contacts.toLocaleString("en-IN")} WhatsApp contacts</p>
                  <p className="rounded-sx-sm bg-sx-surface-2 p-3">
                    {planDefinition.entitlements.website_maintenance > 0 ? "Website maintenance included" : "Website maintenance not included"}
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

      {!loading && !error && (
        <Card className="p-6">
          <h2 className="font-sx-sans text-base font-semibold text-sx-text">Managed AI wallet</h2>
          {walletError ? (
            <div className="mt-3"><ErrorState message={walletError} onRetry={load} /></div>
          ) : account ? (
            <div className="mt-3">
              <Metric
                label="Wallet balance"
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
      {!loading && !error && <Card className="p-6">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">GST invoice details</h2>
        <p className="mt-1 text-xs text-sx-text-subtle">Optional — used only to print on your invoices. GST is already included in every price shown above.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
            placeholder="Legal business name"
            value={profileForm.legal_business_name ?? ""}
            onChange={(e) => setProfileForm((f) => ({ ...f, legal_business_name: e.target.value }))}
          />
          <input
            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
            placeholder="GSTIN"
            value={profileForm.gstin ?? ""}
            onChange={(e) => setProfileForm((f) => ({ ...f, gstin: e.target.value }))}
          />
          <input
            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text sm:col-span-2"
            placeholder="Billing address"
            value={profileForm.billing_address ?? ""}
            onChange={(e) => setProfileForm((f) => ({ ...f, billing_address: e.target.value }))}
          />
          <input
            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
            placeholder="State"
            value={profileForm.billing_state ?? ""}
            onChange={(e) => setProfileForm((f) => ({ ...f, billing_state: e.target.value }))}
          />
          <input
            className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
            placeholder="PIN code"
            value={profileForm.pin_code ?? ""}
            onChange={(e) => setProfileForm((f) => ({ ...f, pin_code: e.target.value }))}
          />
        </div>
        <Button className="mt-3" variant="primary" size="sm" disabled={busy} onClick={saveBillingProfile}>
          Save GST details
        </Button>
      </Card>}

      {/* Invoices */}
      {!loading && !error && <Card className="p-6">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No invoices yet" subtitle="Invoices appear here automatically after each payment." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-sx-text-subtle">
                  <th className="pb-2 pr-4">Invoice</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Taxable</th>
                  <th className="pb-2 pr-4">GST</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-sx-border">
                    <td className="py-2 pr-4 font-mono text-[11px]">{inv.invoice_number}</td>
                    <td className="py-2 pr-4">{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 capitalize">{inv.invoice_type.replace("_", " ")}</td>
                    <td className="py-2 pr-4">{money(inv.taxable_value_cents)}</td>
                    <td className="py-2 pr-4">{money(inv.gst_cents)}</td>
                    <td className="py-2 pr-4 font-semibold">{money(inv.total_cents)}</td>
                    <td className="py-2 capitalize">{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>}
    </div>
  );
}
