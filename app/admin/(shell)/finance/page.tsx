"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { RefreshCw, TrendingUp, Cpu, BarChart2, CreditCard } from "lucide-react";

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

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-sx-text-subtle">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${accent ?? "text-sx-text"}`}>{value}</p>
      {sub && <p className="text-[11px] text-sx-text-muted">{sub}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">{children}</p>
  );
}

function BudgetBadge({ status }: { status: "NORMAL" | "WATCH" | "OVER BUDGET" }) {
  if (status === "NORMAL")
    return <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">Normal</span>;
  if (status === "WATCH")
    return <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">Watch</span>;
  return <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-400">Over Budget</span>;
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
      setError("Network error loading finance data.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8 pb-12">
      <AdminPageHeader
        breadcrumb="Admin"
        title="Finance"
        description="Platform economics — revenue, AI operator spend, net contribution, and budget."
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-xs font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {/* Top KPIs */}
          <section className="flex flex-col gap-3">
            <SectionLabel>Overview</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Gross Revenue"
                value={`₹${data.revenue.grossInr.toLocaleString()}`}
                sub={`₹${data.revenue.monthInr.toLocaleString()} this month`}
                accent="text-emerald-400"
              />
              <Kpi
                label="AI Operator Spend"
                value={`₹${data.costs.totalAiSpendInr.toLocaleString()}`}
                sub={`₹${data.costs.todayAiSpendInr.toLocaleString()} today`}
                accent="text-sx-text"
              />
              <Kpi
                label="Net Contribution"
                value={`₹${data.netPosition.netContributionInr.toLocaleString()}`}
                sub={`${data.netPosition.marginPercent}% net margin`}
                accent="text-sx-accent"
              />
              <div className="flex flex-col gap-1 rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-sx-text-subtle">AI Budget</p>
                  <BudgetBadge status={data.budget.status} />
                </div>
                <p className="text-2xl font-bold tracking-tight text-sx-text">{data.budget.utilizationPercent}%</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sx-surface-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.budget.utilizationPercent > 90
                        ? "bg-rose-500"
                        : data.budget.utilizationPercent > 70
                        ? "bg-amber-500"
                        : "bg-sx-accent"
                    }`}
                    style={{ width: `${Math.min(100, data.budget.utilizationPercent)}%` }}
                  />
                </div>
                <p className="text-[11px] text-sx-text-muted">
                  ₹{data.budget.remainingInr.toLocaleString()} remaining of ₹{data.budget.monthlyBudgetInr.toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          {/* Revenue Intelligence */}
          <section className="flex flex-col gap-3">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp size={12} /> Revenue Intelligence
              </span>
            </SectionLabel>
            <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-5">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                {[
                  { label: "Today", value: `₹${data.revenue.todayInr.toLocaleString()}` },
                  { label: "This Week", value: `₹${data.revenue.weekInr.toLocaleString()}` },
                  { label: "Active Subs", value: String(data.revenue.activeSubscriptions) },
                  { label: "Avg Order", value: `₹${data.revenue.averageOrderValueInr.toLocaleString()}` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-sx-sm bg-sx-surface-2 p-3">
                    <p className="text-sx-text-subtle">{label}</p>
                    <p className="mt-1 text-base font-bold text-sx-text">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-sx-border pt-4 text-xs">
                {[
                  { label: "Captured transactions", value: String(data.revenue.successfulPayments), cls: "" },
                  { label: "Pending / unpaid links", value: `₹${data.revenue.pendingInr.toLocaleString()} (${data.revenue.pendingPayments})`, cls: "text-amber-400" },
                  { label: "Complimentary / promo value", value: `₹${data.revenue.freePromoValueInr.toLocaleString()} (${data.revenue.freePromoRedemptionsCount} free)`, cls: "text-sky-400" },
                  { label: "Total refunds issued", value: `₹${data.revenue.refundsInr.toLocaleString()}`, cls: "text-rose-400" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-sx-text-muted">{label}</span>
                    <span className={`font-semibold ${cls || "text-sx-text"}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-sx-border/60 pt-2">
                  <span className="font-medium text-sx-text-muted">Net settled revenue</span>
                  <span className="font-bold text-emerald-400">₹{data.revenue.netInr.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>

          {/* AI Cost by Provider & Service */}
          <section className="flex flex-col gap-3">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Cpu size={12} /> AI Operator Cost
              </span>
            </SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Providers */}
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-5">
                <p className="mb-3 text-[12px] font-medium text-sx-text">By Provider</p>
                <div className="space-y-2.5">
                  {data.costs.providers.map((p) => (
                    <div key={p.provider}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-sx-text">{p.provider}</span>
                        <span className="font-mono font-semibold text-sx-accent">
                          ₹{p.costInr.toLocaleString()} · {p.percentShare}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sx-surface-2">
                        <div className="h-full bg-sx-accent rounded-full" style={{ width: `${p.percentShare}%` }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-sx-text-subtle">
                        {p.requests.toLocaleString()} calls · {p.tokens.toLocaleString()} tokens
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Services */}
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-5">
                <p className="mb-3 text-[12px] font-medium text-sx-text">By Capability</p>
                <div className="space-y-2.5">
                  {data.costs.services.map((s) => (
                    <div key={s.service}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize text-sx-text">{s.service}</span>
                        <span className="font-mono font-semibold text-sx-text">
                          ₹{s.costInr.toLocaleString()} · {s.percentShare}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sx-surface-2">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.percentShare}%` }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-sx-text-subtle">{s.requests.toLocaleString()} executions</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Product Revenue & Recent Payments */}
          <section className="flex flex-col gap-3">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <BarChart2 size={12} /> Revenue by Product
              </span>
            </SectionLabel>
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              {/* Products */}
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-5">
                <div className="space-y-3">
                  {data.products.map((prod) => (
                    <div
                      key={prod.product}
                      className="flex items-center justify-between border-b border-sx-border pb-2.5 text-xs last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="flex items-center gap-1.5 font-medium text-sx-text">
                          {prod.product}
                          {prod.isComplimentary && (
                            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                              FREE
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-sx-text-subtle">
                          {prod.salesCount} {prod.isComplimentary ? "redeemed" : "paid"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sx-text">₹{prod.revenueInr.toLocaleString()}</p>
                        <p className="text-[10px] text-sx-text-subtle">{prod.percentShare}% of gross</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Payments */}
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 p-5">
                <div className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-sx-text">
                  <CreditCard size={13} strokeWidth={1.75} />
                  Recent Payment Events
                </div>
                {data.recentPayments.length === 0 ? (
                  <p className="text-xs text-sx-text-subtle">No payment events recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentPayments.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-sx-sm bg-sx-surface-2 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-sx-text">{p.description}</p>
                          <p className="text-[10px] text-sx-text-subtle">
                            {p.customer} · {new Date(p.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-sx-text">₹{p.amountInr.toLocaleString()}</span>
                          <span
                            className={`block text-[10px] font-bold uppercase ${
                              p.status === "paid" ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
