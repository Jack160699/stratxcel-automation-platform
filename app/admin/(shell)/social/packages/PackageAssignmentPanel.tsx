"use client";

import { useCallback, useEffect, useState } from "react";
import type { TenantMembership } from "@/lib/tenants/current-tenant";

interface UnboundBrand {
  id: string;
  label: string;
  ownerId: string;
}

interface UnboundAccount {
  id: string;
  platform: string;
  platformLabel: string;
  label: string;
  ownerId: string;
}

interface AssignmentData {
  assignment: {
    brand: { available: boolean; label: string | null; alreadyBound: boolean };
    accounts: Array<{ platform: string; platformLabel: string; label: string; available: boolean; alreadyBound: boolean }>;
  };
  unboundBrands: UnboundBrand[];
  unboundAccounts: UnboundAccount[];
  boundBrand: { id: string; label: string } | null;
  boundAccounts: Array<{ id: string; platform: string; platformLabel: string; label: string }>;
}

async function callAssignmentApi(method: "GET" | "POST", tenantId: string, body?: Record<string, unknown>) {
  const url = `/api/admin/social/package-assignment?tenantId=${encodeURIComponent(tenantId)}`;
  const response = await fetch(method === "GET" ? url : "/api/admin/social/package-assignment", {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify({ tenantId, ...body }) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}

export function PackageAssignmentPanel({ tenants }: { tenants: TenantMembership[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.tenantId ?? "");
  const [data, setData] = useState<AssignmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tenantId) return;
    setError(null);
    callAssignmentApi("GET", tenantId)
      .then((result) => setData(result as AssignmentData))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load assignment data"));
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignBrand = async (brandProfileId: string) => {
    setBusy(`brand:${brandProfileId}`);
    setError(null);
    try {
      await callAssignmentApi("POST", tenantId, { action: "assignBrand", brandProfileId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign Brand Brain");
    } finally {
      setBusy(null);
    }
  };

  const assignAccount = async (accountId: string) => {
    setBusy(`account:${accountId}`);
    setError(null);
    try {
      await callAssignmentApi("POST", tenantId, { action: "assignAccount", accountId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign social account");
    } finally {
      setBusy(null);
    }
  };

  if (!tenants.length) {
    return <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>No client workspaces available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>
          Client workspace
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-2)", color: "var(--saut-text)" }}
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
          >
            {tenants.map((tenant) => (
              <option key={tenant.tenantId} value={tenant.tenantId}>
                {tenant.name} ({tenant.slug})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--saut-danger)" }}>{error}</p>}

      {!data ? (
        <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>Loading assignment data…</p>
      ) : (
        <>
          <div>
            <div className="saut-section-title mb-2 text-xs">Bound to workspace</div>
            {data.boundBrand ? (
              <p className="text-sm">Brand Brain: {data.boundBrand.label}</p>
            ) : (
              <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>No Brand Brain assigned.</p>
            )}
            {data.boundAccounts.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {data.boundAccounts.map((account) => (
                  <li key={account.id}>{account.platformLabel}: {account.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm" style={{ color: "var(--saut-text-subtle)" }}>No social accounts assigned.</p>
            )}
          </div>

          <div>
            <div className="saut-section-title mb-2 text-xs">Unbound Brand Brains</div>
            {!data.unboundBrands.length ? (
              <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>None available.</p>
            ) : (
              <div className="space-y-2">
                {data.unboundBrands.map((brand) => (
                  <div key={brand.id} className="saut-card-2 flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
                    <span>{brand.label}</span>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs font-medium"
                      style={{ background: "var(--saut-accent)", color: "var(--saut-surface)" }}
                      disabled={busy === `brand:${brand.id}` || Boolean(data.boundBrand)}
                      onClick={() => void assignBrand(brand.id)}
                    >
                      {busy === `brand:${brand.id}` ? "Assigning…" : "Assign to workspace"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="saut-section-title mb-2 text-xs">Unbound connected accounts</div>
            {!data.unboundAccounts.length ? (
              <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>None available.</p>
            ) : (
              <div className="space-y-2">
                {data.unboundAccounts.map((account) => (
                  <div key={account.id} className="saut-card-2 flex flex-wrap items-center justify-between gap-2 p-2.5 text-xs">
                    <span>{account.platformLabel}: {account.label}</span>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs font-medium"
                      style={{ background: "var(--saut-accent)", color: "var(--saut-surface)" }}
                      disabled={busy === `account:${account.id}`}
                      onClick={() => void assignAccount(account.id)}
                    >
                      {busy === `account:${account.id}` ? "Assigning…" : "Assign to workspace"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
