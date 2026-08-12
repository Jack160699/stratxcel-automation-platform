"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Card, CardRow } from "@/components/ui/Card";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface AuditEvent {
  id: string;
  actor_kind: "user" | "system" | "hermes" | "integration";
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
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
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Audit Log{active ? ` — ${active.name}` : ""}</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Most recent 100 events for this client.</p>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {!tenantId && <NoClientSelected what="the audit log" />}

      {tenantId && listLoading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
      {!listLoading && events?.length === 0 && !error && <EmptyState title="No audit events yet." />}
      {events && events.length > 0 && (
        <Card>
          {events.map((e) => (
            <CardRow key={e.id} className="items-start">
              <span className="w-40 shrink-0 font-sx-mono text-[11px] text-sx-text-muted">{new Date(e.created_at).toLocaleString()}</span>
              <span className="flex-1 text-sx-text">{e.action}</span>
              <span className="shrink-0 font-sx-mono text-[10px] uppercase tracking-[0.08em] text-sx-text-subtle">{e.actor_kind}</span>
            </CardRow>
          ))}
        </Card>
      )}
    </div>
  );
}
