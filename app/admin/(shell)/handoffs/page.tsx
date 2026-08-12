"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface Handoff {
  id: string;
  mission_id: string | null;
  reason: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "RETURNED_TO_MISSION";
  created_at: string;
}

const STATUS_CHIP: Record<Handoff["status"], { label: string; state: ChipState }> = {
  OPEN: { label: "Open", state: "warning" },
  IN_PROGRESS: { label: "In progress", state: "accent" },
  RESOLVED: { label: "Resolved", state: "success" },
  RETURNED_TO_MISSION: { label: "Returned to mission", state: "success" },
};

/**
 * New route required by ADMIN_INFORMATION_ARCHITECTURE.md §1
 * (/admin/handoffs) — the @stratxcel/human-handoff package and
 * human_handoffs table already existed (packages/human-handoff,
 * supabase/migrations/20260803121500_approvals_wallet_handoff.sql) with no
 * API route or page consuming them yet. Resolve returns the originating
 * mission to RESUMED automatically (resolveHumanHandoff's own behavior).
 */
export default function AdminHandoffsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [handoffs, setHandoffs] = useState<Handoff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/handoffs?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setHandoffs([]);
        setError(body.error ?? `Failed to load handoffs (HTTP ${res.status})`);
        return;
      }
      setHandoffs(body.handoffs);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function resolve(handoffId: string) {
    if (!tenantId) return;
    setResolvingId(handoffId);
    setError(null);
    try {
      const res = await fetch(`/api/platform/handoffs/${handoffId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to resolve (HTTP ${res.status})`);
        return;
      }
      await load();
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Human Handoffs{active ? ` — ${active.name}` : ""}</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Missions that hit a point requiring a human — resolving one returns its mission to RESUMED.</p>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {!tenantId && <NoClientSelected what="handoffs" />}

      <section className="flex flex-col gap-3">
        {tenantId && listLoading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenantId && !listLoading && handoffs?.length === 0 && !error && <EmptyState title="No open handoffs." />}
        {handoffs && handoffs.length > 0 && (
          <div className="flex flex-col gap-2">
            {handoffs.map((h) => {
              const chip = STATUS_CHIP[h.status];
              return (
                <Card key={h.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sx-text">{h.reason}</p>
                    <p className="mt-0.5 text-xs text-sx-text-subtle">
                      {h.mission_id ? `Mission ${h.mission_id.slice(0, 8)}` : "No linked mission"} · {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                    {(h.status === "OPEN" || h.status === "IN_PROGRESS") && (
                      <Button variant="primary" size="sm" onClick={() => resolve(h.id)} disabled={resolvingId === h.id}>
                        {resolvingId === h.id ? "Resolving…" : "Resolve"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
