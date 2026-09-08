"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { RefreshCw, Activity, Bot, User, Zap, Link2 } from "lucide-react";

interface AuditEvent {
  id: string;
  actor_kind: "user" | "system" | "hermes" | "integration";
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

const ACTOR_ICON: Record<AuditEvent["actor_kind"], React.ReactNode> = {
  user: <User size={15} strokeWidth={1.75} />,
  system: <Activity size={15} strokeWidth={1.75} />,
  hermes: <Bot size={15} strokeWidth={1.75} />,
  integration: <Link2 size={15} strokeWidth={1.75} />,
};

const ACTOR_DOT: Record<AuditEvent["actor_kind"], string> = {
  user: "connected",
  system: "paused",
  hermes: "running",
  integration: "paused",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * New route required by ADMIN_INFORMATION_ARCHITECTURE.md §1 (/admin/audit)
 * — the @stratxcel/audit package and audit_events table already existed
 * (recordAuditEvent is called from missions/approvals/handoffs repository
 * functions) with no page consuming listAuditEvents yet.
 */
export default function AdminAuditPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/audit?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setEvents([]);
        setError(body.error ?? `Failed to load audit log (HTTP ${res.status})`);
        return;
      }
      setEvents(body.events);
    } finally {
      setListLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        breadcrumb="Admin"
        title={`Audit Log${active ? ` — ${active.name}` : ""}`}
        description="Chronological event trail for this workspace. Most recent 100 events."
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

      {!tenantId && <NoClientSelected what="the audit log" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {tenantId && !listLoading && !error && events?.length === 0 && (
        <AdminEmptyState
          icon={<Zap size={20} strokeWidth={1.5} />}
          title="No audit events yet"
          description="Events will appear here as the workspace generates activity."
        />
      )}

      {events && events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {events.map((e) => (
            <AdminEntityRow
              key={e.id}
              icon={ACTOR_ICON[e.actor_kind]}
              title={e.action}
              subtitle={
                e.target_type
                  ? `${e.target_type}${e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ""}`
                  : undefined
              }
              status={<AdminStatusDot status={ACTOR_DOT[e.actor_kind]} customLabel={e.actor_kind} />}
              timestamp={fmt(e.created_at)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
