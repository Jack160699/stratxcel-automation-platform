"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { ErrorState } from "@/components/ui/Feedback";
import { EmptyState } from "@/components/ui/Feedback";
import { PLANS, SELF_CHECKOUT_PLAN_IDS, formatGstInclusivePrice } from "@stratxcel/payments-and-wallet";

interface WalletAccount {
  tenant_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
}

/** Reuses the existing tenant-scoped /api/platform/wallet route — same data as /admin/(shell)/platform/wallet, viewed from the client's own side. */
export default function BillingPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId!)}`);
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? `Failed to load wallet (HTTP ${res.status})`);
          return;
        }
        setAccount(body.account);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Billing{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {error && <ErrorState message={error} />}
      {loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}

      {account && (
        <Card className="p-6">
          <Metric
            label="Wallet balance"
            value={`${account.currency} ${(account.balance_cents / 100).toFixed(2)}`}
            deltaLabel={`last updated ${new Date(account.updated_at).toLocaleString()}`}
          />
        </Card>
      )}

      <section>
        <h2 className="font-sx-sans text-base font-semibold text-sx-text">Available plans</h2>
        <p className="mt-1 text-xs text-sx-text-subtle">Plan checkout remains disabled during payment safety certification. No charge can be created from this page.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {SELF_CHECKOUT_PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            return <Card key={id} className="p-5"><p className="font-semibold text-sx-text">{plan.name}</p><p className="mt-1 text-sm text-sx-accent">{formatGstInclusivePrice(plan)}</p><p className="mt-2 text-xs text-sx-text-muted">{plan.summary}</p><button disabled className="mt-4 w-full cursor-not-allowed rounded-sx-sm border border-sx-border px-3 py-2 text-xs text-sx-text-subtle">Checkout unavailable</button></Card>;
          })}
        </div>
      </section>

      <EmptyState title="Invoice history not yet connected" subtitle="Wallet balance above is real; invoice history has no backend yet." />
    </div>
  );
}
