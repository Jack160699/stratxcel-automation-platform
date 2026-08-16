"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

interface Approval {
  id: string;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  created_at: string;
}

/** Reuses the exact same tenant-scoped /api/platform/approvals routes as app/admin/(shell)/platform/approvals/page.tsx. */
export default function ClientApprovalsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const readOnly = active?.accessMode === "staff_support";
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
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Approvals{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {error && <ErrorState message={error} />}

      <section className="flex flex-col gap-3">
        {tenantId && approvals === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenantId && approvals?.length === 0 && <EmptyState title="Nothing pending." />}
        {approvals && approvals.length > 0 && (
          <div className="flex flex-col gap-2">
            {approvals.map((a) => (
              <Card key={a.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-medium text-sx-text">{a.kind}</p>
                  <p className="break-all text-xs text-sx-text-subtle">{JSON.stringify(a.subject)}</p>
                </div>
                {readOnly ? <p className="text-xs text-sx-text-subtle">Read-only staff support</p> : <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => decide(a.id, "REJECTED")} disabled={decidingId === a.id}>
                    Reject
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => decide(a.id, "APPROVED")} disabled={decidingId === a.id}>
                    Approve
                  </Button>
                </div>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
