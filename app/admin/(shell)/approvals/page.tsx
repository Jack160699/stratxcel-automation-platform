"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";

interface Approval {
  id: string;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  created_at: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusToState(status: string): string {
  if (status === "PENDING") return "paused";
  if (status === "APPROVED") return "connected";
  if (status === "REJECTED") return "error";
  return "not_configured";
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

  const pending = (approvals ?? []).filter((a) => a.status === "PENDING");
  const resolved = (approvals ?? []).filter((a) => a.status !== "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        breadcrumb="Admin"
        title={`Approvals${active ? ` — ${active.name}` : ""}`}
        description="Hermes actions requiring Founder sign-off before execution."
        actions={
          <button
            onClick={load}
            disabled={listLoading}
            className="inline-flex h-8 items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-xs font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text disabled:opacity-40"
          >
            <RefreshCw size={12} className={listLoading ? "animate-spin" : ""} />
            {listLoading ? "Loading…" : "Refresh"}
          </button>
        }
      />

      {!tenantId && <NoClientSelected what="approvals" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {tenantId && !listLoading && !error && approvals?.length === 0 && (
        <AdminEmptyState
          icon={<CheckCircle2 size={20} strokeWidth={1.5} />}
          title="No pending approvals"
          description="Hermes will surface decisions here when actions require your sign-off."
        />
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
            Awaiting decision · {pending.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {pending.map((a) => (
              <AdminEntityRow
                key={a.id}
                icon={<Clock size={15} strokeWidth={1.75} />}
                title={a.kind}
                subtitle={
                  Object.keys(a.subject).length > 0
                    ? JSON.stringify(a.subject).slice(0, 80)
                    : undefined
                }
                timestamp={fmt(a.created_at)}
                status={<AdminStatusDot status="paused" customLabel="Pending" />}
                primaryAction={
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => decide(a.id, "REJECTED")}
                      disabled={decidingId === a.id}
                    >
                      <XCircle size={13} className="mr-1" />
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => decide(a.id, "APPROVED")}
                      disabled={decidingId === a.id}
                    >
                      <CheckCircle2 size={13} className="mr-1" />
                      {decidingId === a.id ? "Deciding…" : "Approve"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
            Resolved · {resolved.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {resolved.map((a) => (
              <AdminEntityRow
                key={a.id}
                icon={<CheckCircle2 size={15} strokeWidth={1.75} />}
                title={a.kind}
                subtitle={
                  Object.keys(a.subject).length > 0
                    ? JSON.stringify(a.subject).slice(0, 80)
                    : undefined
                }
                timestamp={fmt(a.created_at)}
                status={<AdminStatusDot status={statusToState(a.status)} customLabel={a.status} />}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
