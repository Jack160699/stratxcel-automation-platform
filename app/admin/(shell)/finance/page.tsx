"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface FinanceData {
  revenue: {
    grossInr: number;
    todayInr: number;
    weekInr: number;
    monthInr: number;
    refundsInr: number;
    netInr: number;
    pendingInr: number;
    freePromoValueInr: number;
    successfulPayments: number;
    failedPayments: number;
    pendingPayments: number;
    freePromoRedemptionsCount: number;
    activeSubscriptions: number;
    averageOrderValueInr: number;
  };
  costs: {
    totalAiSpendInr: number;
    todayAiSpendInr: number;
    monthAiSpendInr: number;
    totalRequests: number;
    totalTokens: number;
    providers: Array<{
      provider: string;
      requests: number;
      tokens: number;
      costInr: number;
      percentShare: number;
    }>;
    services: Array<{
      service: string;
      requests: number;
      costInr: number;
      percentShare: number;
    }>;
  };
  netPosition: {
    grossRevenueInr: number;
    totalCostInr: number;
    netContributionInr: number;
    marginPercent: number;
  };
  budget: {
    dailyBudgetInr: number;
    monthlyBudgetInr: number;
    monthUsedInr: number;
    remainingInr: number;
    utilizationPercent: number;
    status: "NORMAL" | "WATCH" | "OVER BUDGET";
  };
  products: Array<{
    product: string;
    salesCount: number;
    revenueInr: number;
    percentShare: number;
    isComplimentary?: boolean;
  }>;
  recentPayments: Array<{
    description: string;
    amountInr: number;
    status: string;
    customer: string;
    createdAt: string;
  }>;
}

export default function AdminFinancePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId ?? "stratxcel";
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/finance?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load finance data (HTTP ${res.status})`);
        return;
      }
      setData(body);
    } catch {
      setError("Network error loading finance control center.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const budgetStatusBadge = (status: "NORMAL" | "WATCH" | "OVER BUDGET") => {
    switch (status) {
      case "NORMAL":
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">🟢 Normal</span>;
      case "WATCH":
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-400">🟡 Watch</span>;
      case "OVER BUDGET":
        return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-400">🔴 Over Budget</span>;
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sx-accent">Platform Economics</p>
          <h1 className="mt-1 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Billing, Revenue & AI Cost Intelligence
          </h1>
          <p className="mt-1 text-sm text-sx-text-muted">
            Stratxcel financial control center, operator spend, and net contribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface-2 px-4 text-xs font-semibold text-sx-text hover:bg-sx-surface-1 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Financials"}
          </button>
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {/* Top 4 KPI Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <Metric
                label="Gross Revenue Received"
                value={`₹${data.revenue.grossInr.toLocaleString()}`}
                deltaLabel={`₹${data.revenue.monthInr.toLocaleString()} this month`}
              />
            </Card>

            <Card className="p-5">
              <Metric
                label="Tracked AI Operator Spend"
                value={`₹${data.costs.totalAiSpendInr.toLocaleString()}`}
                deltaLabel={`₹${data.costs.todayAiSpendInr.toLocaleString()} today`}
              />
            </Card>

            <Card className="p-5">
              <Metric
                label="Net Contribution"
                value={`₹${data.netPosition.netContributionInr.toLocaleString()}`}
                deltaLabel={`${data.netPosition.marginPercent}% Net Margin`}
              />
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-sx-text-muted">AI Budget Status</p>
                {budgetStatusBadge(data.budget.status)}
              </div>
              <p className="mt-3 font-sx-sans text-2xl font-semibold text-sx-text sm:text-3xl">
                {data.budget.utilizationPercent}%
              </p>
              <p className="mt-1 text-xs text-sx-text-muted">
                ₹{data.budget.remainingInr.toLocaleString()} remaining of ₹{data.budget.monthlyBudgetInr.toLocaleString()}
              </p>
            </Card>
          </section>

          {/* Second Section: Revenue Intelligence & AI Budget Monitor */}
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Revenue Details */}
            <Card className="p-6">
              <CardHeading>Payment & Revenue Intelligence</CardHeading>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                <div className="rounded-sx-sm bg-sx-surface-2 p-3">
                  <span className="text-sx-text-subtle">Today</span>
                  <p className="mt-1 text-base font-bold text-sx-text">₹{data.revenue.todayInr.toLocaleString()}</p>
                </div>
                <div className="rounded-sx-sm bg-sx-surface-2 p-3">
                  <span className="text-sx-text-subtle">This Week</span>
                  <p className="mt-1 text-base font-bold text-sx-text">₹{data.revenue.weekInr.toLocaleString()}</p>
                </div>
                <div className="rounded-sx-sm bg-sx-surface-2 p-3">
                  <span className="text-sx-text-subtle">Active Subscriptions</span>
                  <p className="mt-1 text-base font-bold text-sx-text">{data.revenue.activeSubscriptions}</p>
                </div>
                <div className="rounded-sx-sm bg-sx-surface-2 p-3">
                  <span className="text-sx-text-subtle">Average Order Value</span>
                  <p className="mt-1 text-base font-bold text-sx-text">₹{data.revenue.averageOrderValueInr.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-sx-border space-y-2">
                <div className="flex justify-between text-xs text-sx-text">
                  <span className="text-sx-text-muted">Total Captured Transactions</span>
                  <span className="font-semibold">{data.revenue.successfulPayments}</span>
                </div>
                <div className="flex justify-between text-xs text-sx-text">
                  <span className="text-sx-text-muted">Pending / Unpaid Payment Links</span>
                  <span className="font-semibold text-amber-400">₹{data.revenue.pendingInr.toLocaleString()} ({data.revenue.pendingPayments} links)</span>
                </div>
                <div className="flex justify-between text-xs text-sx-text">
                  <span className="text-sx-text-muted">Complimentary / Promo Discount Value</span>
                  <span className="font-semibold text-sky-400">₹{data.revenue.freePromoValueInr.toLocaleString()} ({data.revenue.freePromoRedemptionsCount} free redemptions · ₹0 Paid)</span>
                </div>
                <div className="flex justify-between text-xs text-sx-text">
                  <span className="text-sx-text-muted">Total Refunds Issued</span>
                  <span className="font-semibold text-rose-400">₹{data.revenue.refundsInr.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-sx-text pt-2 border-t border-sx-border/60">
                  <span className="text-sx-text-muted font-medium">Net Settled Revenue</span>
                  <span className="font-bold text-emerald-400">₹{data.revenue.netInr.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            {/* AI Budget Progress */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <CardHeading>AI Spend & Budget Control</CardHeading>
                {budgetStatusBadge(data.budget.status)}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-sx-text-muted">Monthly AI Budget Consumption</span>
                    <span className="font-mono font-semibold text-sx-text">
                      ₹{data.budget.monthUsedInr.toLocaleString()} / ₹{data.budget.monthlyBudgetInr.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-sx-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.budget.utilizationPercent > 90 ? "bg-rose-500" : data.budget.utilizationPercent > 70 ? "bg-amber-500" : "bg-sx-accent"
                      }`}
                      style={{ width: `${Math.min(100, data.budget.utilizationPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                  <div className="rounded-sx-sm border border-sx-border p-2.5">
                    <span className="text-sx-text-subtle">Total AI Requests</span>
                    <p className="mt-1 text-sm font-bold text-sx-text">{data.costs.totalRequests.toLocaleString()}</p>
                  </div>
                  <div className="rounded-sx-sm border border-sx-border p-2.5">
                    <span className="text-sx-text-subtle">Total Tokens Processed</span>
                    <p className="mt-1 text-sm font-bold text-sx-text">{data.costs.totalTokens.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Third Section: AI Operator Cost Dashboard (Providers & Services) */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* By Provider */}
            <Card className="p-6">
              <CardHeading>AI Operator Cost by Provider</CardHeading>
              <p className="mt-1 text-xs text-sx-text-muted">Model & API runtime consumption breakdown.</p>
              <div className="mt-4 space-y-3">
                {data.costs.providers.map((p) => (
                  <div key={p.provider} className="rounded-sx-sm border border-sx-border p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-sx-text">{p.provider}</span>
                      <span className="font-mono font-semibold text-sx-accent">₹{p.costInr.toLocaleString()} ({p.percentShare}%)</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-sx-text-subtle">
                      <span>{p.requests.toLocaleString()} calls</span>
                      <span>{p.tokens.toLocaleString()} tokens</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-sx-surface-2 overflow-hidden">
                      <div className="h-full bg-sx-accent rounded-full" style={{ width: `${p.percentShare}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* By Service */}
            <Card className="p-6">
              <CardHeading>Spend by Platform Capability</CardHeading>
              <p className="mt-1 text-xs text-sx-text-muted">Direct AI costs allocated across platform modules.</p>
              <div className="mt-4 space-y-3">
                {data.costs.services.map((s) => (
                  <div key={s.service} className="rounded-sx-sm border border-sx-border p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-sx-text capitalize">{s.service}</span>
                      <span className="font-mono font-semibold text-sx-text">₹{s.costInr.toLocaleString()} ({s.percentShare}%)</span>
                    </div>
                    <div className="mt-1 text-[11px] text-sx-text-subtle">
                      {s.requests.toLocaleString()} executions
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-sx-surface-2 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.percentShare}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* Fourth Section: Revenue by Product & Recent Payments */}
          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Products */}
            <Card className="p-6">
              <CardHeading>Revenue by Product Tier</CardHeading>
              <div className="mt-4 space-y-3">
                {data.products.map((prod) => (
                  <div key={prod.product} className="flex items-center justify-between border-b border-sx-border pb-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-sx-text flex items-center gap-1.5">
                        {prod.product}
                        {prod.isComplimentary && (
                          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                            PROMO / ₹0
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-sx-text-subtle">{prod.salesCount} {prod.isComplimentary ? "redeemed" : "paid"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-sx-text">₹{prod.revenueInr.toLocaleString()}</p>
                      <p className="text-[10px] text-sx-text-subtle">{prod.percentShare}% of gross</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent Payments */}
            <Card className="p-6">
              <CardHeading>Recent Payment Events</CardHeading>
              {data.recentPayments.length === 0 ? (
                <p className="mt-3 text-xs text-sx-text-subtle">No payment events recorded yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.recentPayments.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-sx-sm bg-sx-surface-2 px-3 py-2 text-xs">
                      <div>
                        <p className="font-semibold text-sx-text">{p.description}</p>
                        <p className="text-[10px] text-sx-text-subtle">{p.customer} · {new Date(p.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-sx-text">₹{p.amountInr.toLocaleString()}</span>
                        <span className={`block text-[10px] uppercase font-bold ${p.status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
