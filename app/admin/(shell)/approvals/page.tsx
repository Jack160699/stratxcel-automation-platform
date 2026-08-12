"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface Approval {
  id: string;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  created_at: string;
}

export default function ApprovalsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setApprovals([]);
        setError(body.error ?? `Failed to load approvals (HTTP ${res.status})`);
        return;
      }
      setApprovals(body.approvals);
    } finally {
      setListLoading(false);
    }
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
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Approvals{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Pending approvals</h2>
        {!tenantId && <NoClientSelected what="approvals" />}
        {tenantId && listLoading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenantId && !listLoading && approvals?.length === 0 && !error && <p className="text-sm text-sx-text-subtle">No pending approvals.</p>}
        {tenantId && !listLoading && error && approvals?.length === 0 && <ErrorState message={error} onRetry={load} />}
        {approvals && approvals.length > 0 && (
          <div className="flex flex-col gap-2">
            {approvals.map((a) => (
              <Card key={a.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-sx-text">{a.kind}</p>
                  <p className="max-w-md truncate text-xs text-sx-text-subtle">{JSON.stringify(a.subject)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => decide(a.id, "REJECTED")} disabled={decidingId === a.id}>
                    Reject
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => decide(a.id, "APPROVED")} disabled={decidingId === a.id}>
                    Approve
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
