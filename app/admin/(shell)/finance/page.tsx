"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface WalletAccount {
  tenant_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
}

interface AdminSubscription {
  id: string;
  plan_tier: string;
  status: string;
  price_cents: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  payment_link_id: string | null;
}

interface AdminInvoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  total_cents: number;
  status: string;
  created_at: string;
}

export default function WalletPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [subscription, setSubscription] = useState<AdminSubscription | null>(null);
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [walletRes, subRes] = await Promise.all([
        platformFetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId)}`),
        platformFetch(`/api/platform/subscriptions?tenantId=${encodeURIComponent(tenantId)}`),
      ]);
      const walletBody = await walletRes.json();
      if (!walletRes.ok) {
        setAccount(null);
        setError(walletBody.error ?? `Failed to load wallet (HTTP ${walletRes.status})`);
        return;
      }
      setAccount(walletBody.account);

      const subBody = await subRes.json();
      if (subRes.ok) {
        setSubscription(subBody.subscription);
        setInvoices(subBody.invoices ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Finance / Wallet{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {!tenantId && <NoClientSelected what="the wallet" />}
      {error && <ErrorState message={error} onRetry={load} />}
      {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {account && (
        <Card className="p-6">
          <Metric
            label="Balance"
            value={`${account.currency} ${(account.balance_cents / 100).toFixed(2)}`}
            deltaLabel={`last updated ${new Date(account.updated_at).toLocaleString()}`}
          />
        </Card>
      )}

      {tenantId && !loading && (
        <Card className="p-6">
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Subscription (support view)</h2>
          {!subscription ? (
            <p className="mt-3 text-xs text-sx-text-subtle">No subscription on this tenant.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-sx-text-subtle">Plan</dt><dd className="font-semibold text-sx-text capitalize">{subscription.plan_tier}</dd></div>
              <div><dt className="text-sx-text-subtle">Status</dt><dd className="font-semibold text-sx-text">{subscription.status}{subscription.cancel_at_period_end ? " (cancelling)" : ""}</dd></div>
              <div><dt className="text-sx-text-subtle">Price</dt><dd className="font-semibold text-sx-text">₹{(subscription.price_cents / 100).toFixed(2)}/mo</dd></div>
              <div><dt className="text-sx-text-subtle">Period end</dt><dd className="font-semibold text-sx-text">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</dd></div>
            </dl>
          )}

          <h3 className="mt-5 font-sx-sans text-xs font-semibold text-sx-text-subtle uppercase tracking-wide">Recent invoices</h3>
          {invoices.length === 0 ? (
            <p className="mt-2 text-xs text-sx-text-subtle">No invoices issued yet.</p>
          ) : (
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {invoices.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="border-t border-sx-border">
                    <td className="py-1.5 pr-3 font-mono text-[11px]">{inv.invoice_number}</td>
                    <td className="py-1.5 pr-3 capitalize">{inv.invoice_type}</td>
                    <td className="py-1.5 pr-3">₹{(inv.total_cents / 100).toFixed(2)}</td>
                    <td className="py-1.5">{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
