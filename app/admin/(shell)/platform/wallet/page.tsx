"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";

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
        <h1 className="text-xl font-semibold text-slate-100">Wallet{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {!tenantId && <NoClientSelected what="the wallet" />}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {tenantId && loading && <p className="text-sm text-slate-500">Loading…</p>}

      {account && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
          <p className="text-sm text-slate-400">Balance</p>
          <p className="text-3xl font-semibold text-slate-100">
            {account.currency} {(account.balance_cents / 100).toFixed(2)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Last updated {new Date(account.updated_at).toLocaleString()}</p>
        </section>
      )}
    </div>
  );
}
