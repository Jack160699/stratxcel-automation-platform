"use client";

import { useEffect, useState } from "react";
import { useTenantId } from "../useTenantId";
import { TenantIdBar } from "../TenantIdBar";

interface Approval {
  id: string;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  created_at: string;
}

export default function ApprovalsPage() {
  const [tenantId, setTenantId] = useTenantId();
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load approvals (HTTP ${res.status})`);
      return;
    }
    setApprovals(body.approvals);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    if (!tenantId) return;
    setDecidingId(approvalId);
    setError(null);
    try {
      const res = await fetch(`/api/platform/approvals/${approvalId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, decision }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to decide (HTTP ${res.status})`);
        return;
      }
      await load();
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TenantIdBar tenantId={tenantId} onChange={setTenantId} />

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Pending approvals</h2>
        {!tenantId && <p className="text-sm text-slate-500">Set a tenant ID above to view approvals.</p>}
        {tenantId && approvals === null && <p className="text-sm text-slate-500">Loading…</p>}
        {tenantId && approvals?.length === 0 && <p className="text-sm text-slate-500">No pending approvals.</p>}
        {approvals && approvals.length > 0 && (
          <ul className="flex flex-col gap-2">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-200">{a.kind}</p>
                  <p className="max-w-md truncate text-xs text-slate-500">{JSON.stringify(a.subject)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(a.id, "APPROVED")}
                    disabled={decidingId === a.id}
                    className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide(a.id, "REJECTED")}
                    disabled={decidingId === a.id}
                    className="rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
