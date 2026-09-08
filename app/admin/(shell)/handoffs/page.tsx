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
import { HandMetal, RefreshCw } from "lucide-react";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

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
  RETURNED_TO_MISSION: { label: "Returned", state: "success" },
};

function statusToState(status: Handoff["status"]): string {
  if (status === "OPEN") return "needs_attention";
  if (status === "IN_PROGRESS") return "running";
  if (status === "RESOLVED" || status === "RETURNED_TO_MISSION") return "connected";
  return "not_configured";
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * New route required by ADMIN_INFORMATION_ARCHITECTURE.md §1
 * (/admin/handoffs) — the @stratxcel/human-handoff package and
 * human_handoffs table already existed with no page consuming them yet.
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

  const open = (handoffs ?? []).filter((h) => h.status === "OPEN" || h.status === "IN_PROGRESS");
  const closed = (handoffs ?? []).filter((h) => h.status === "RESOLVED" || h.status === "RETURNED_TO_MISSION");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        breadcrumb="Admin"
        title={`Human Handoffs${active ? ` — ${active.name}` : ""}`}
        description="Missions that hit a point requiring human judgment. Resolving returns the mission to RESUMED."
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

      {!tenantId && <NoClientSelected what="handoffs" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {tenantId && !listLoading && !error && handoffs?.length === 0 && (
        <AdminEmptyState
          icon={<HandMetal size={20} strokeWidth={1.5} />}
          title="No open handoffs"
          description="Hermes will flag situations here when human judgment is needed."
        />
      )}

      {/* Open */}
      {open.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
            Needs attention · {open.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {open.map((h) => {
              const chip = STATUS_CHIP[h.status];
              return (
                <AdminEntityRow
                  key={h.id}
                  icon={<HandMetal size={15} strokeWidth={1.75} />}
                  title={h.reason}
                  subtitle={h.mission_id ? `Mission ${h.mission_id.slice(0, 8)}` : "No linked mission"}
                  timestamp={fmt(h.created_at)}
                  status={<StatusChip state={chip.state}>{chip.label}</StatusChip>}
                  primaryAction={
                    <div onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => resolve(h.id)}
                        disabled={resolvingId === h.id}
                      >
                        {resolvingId === h.id ? "Resolving…" : "Resolve"}
                      </Button>
                    </div>
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Closed */}
      {closed.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sx-text-subtle">
            Resolved · {closed.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {closed.map((h) => {
              const chip = STATUS_CHIP[h.status];
              return (
                <AdminEntityRow
                  key={h.id}
                  icon={<HandMetal size={15} strokeWidth={1.75} />}
                  title={h.reason}
                  subtitle={h.mission_id ? `Mission ${h.mission_id.slice(0, 8)}` : "No linked mission"}
                  timestamp={fmt(h.created_at)}
                  status={<AdminStatusDot status={statusToState(h.status)} customLabel={chip.label} />}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
