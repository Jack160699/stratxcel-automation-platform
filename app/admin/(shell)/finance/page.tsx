"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { ErrorState } from "@/components/ui/Feedback";

interface WalletAccount {
  tenant_id: string;
  balance_cents: number;
  currency: string;
  updated_at: string;
}

export default function WalletPage() {
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
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Finance / Wallet{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {!tenantId && <NoClientSelected what="the wallet" />}
      {error && <ErrorState message={error} />}
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
    </div>
  );
}
