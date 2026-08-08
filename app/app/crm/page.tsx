"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader, ModuleStatusSummary } from "../components/ModulePageHeader";
import { DetailPanel } from "../components/DetailPanel";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { Metric } from "@/components/ui/Metric";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";

export interface LeadSummary {
  id: string;
  tenant_id: string;
  source: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  metadata: Record<string, unknown>;
  tags: string[];
  assigned_to: string | null;
  last_interaction_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const LEAD_STATUS_CHIP: Record<string, { label: string; state: ChipState }> = {
  NEW: { label: "New", state: "accent" },
  CONTACTED: { label: "Contacted", state: "warning" },
  QUALIFIED: { label: "Qualified", state: "ai" },
  WON: { label: "Won", state: "success" },
  LOST: { label: "Lost", state: "neutral" },
};

const PIPELINE_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

/**
 * Real, tenant-scoped CRM over @stratxcel/leads-and-crm's crm_leads table
 * (see app/api/platform/leads/route.ts — the first route consuming it).
 * whatsapp_shadow_messages (also real, tenant-scoped) is not the owner-
 * scoped Social inbox — see app/api/platform/whatsapp/shadow-messages/route.ts.
 */
export default function CrmPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeadSummary | null>(null);
  const [updating, setUpdating] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load leads (HTTP ${res.status})`);
      return;
    }
    setLeads(body.leads);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES) counts[stage] = 0;
    for (const lead of leads ?? []) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    return counts;
  }, [leads]);

  const filtered = statusFilter ? (leads ?? []).filter((l) => l.status === statusFilter) : leads ?? [];

  async function updateStatus(leadId: string, status: string) {
    if (!tenantId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/platform/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, status }),
      });
      const body = await res.json();
      if (res.ok) {
        setSelected(body.lead);
        await load();
      }
    } finally {
      setUpdating(false);
    }
  }

  const columns: DataTableColumn<LeadSummary>[] = [
    { key: "contact", header: "Contact", render: (l) => l.contact_name || l.contact_phone || l.contact_email || "Unknown" },
    { key: "source", header: "Source", render: (l) => l.source },
    {
      key: "status",
      header: "Status",
      mobilePrimary: true,
      render: (l) => {
        const chip = LEAD_STATUS_CHIP[l.status] ?? { label: l.status, state: "neutral" as ChipState };
        return <StatusChip state={chip.state}>{chip.label}</StatusChip>;
      },
    },
    { key: "created", header: "Received", render: (l) => new Date(l.created_at).toLocaleDateString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="CRM & Leads" tenantName={active?.name} description="Real leads for this workspace, sourced from WhatsApp, your website form, or manual entry." />

      {error && <ErrorState message={error} onRetry={load} />}

      <ModuleStatusSummary>
        {PIPELINE_STAGES.map((stage) => (
          <button key={stage} type="button" onClick={() => setStatusFilter(statusFilter === stage ? null : stage)} className="text-left">
            <Metric label={LEAD_STATUS_CHIP[stage].label} value={stageCounts[stage] ?? 0} deltaLabel={statusFilter === stage ? "filtering" : "in pipeline"} />
          </button>
        ))}
      </ModuleStatusSummary>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">{statusFilter ? `${LEAD_STATUS_CHIP[statusFilter].label} leads` : "All leads"}</h2>
          {statusFilter && (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter(null)}>
              Clear filter
            </Button>
          )}
        </div>
        {tenantId && leads === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {leads && filtered.length === 0 && <EmptyModuleState resource="leads" subtitle="New inquiries from WhatsApp or your website form will show up here." />}
        {filtered.length > 0 && <DataTable columns={columns} rows={filtered} onRowClick={setSelected} />}
      </section>

      <DetailPanel open={selected !== null} onClose={() => setSelected(null)} title={selected?.contact_name || selected?.contact_phone || selected?.contact_email || "Lead"}>
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-xs text-sx-text-muted">
              <p>Phone: {selected.contact_phone ?? "—"}</p>
              <p>Email: {selected.contact_email ?? "—"}</p>
              <p>Source: {selected.source}</p>
              <p>Assigned owner: {selected.assigned_to ? "Assigned to a staff member" : "Unassigned"}</p>
              <p>Next follow-up: {selected.next_follow_up_at ? new Date(selected.next_follow_up_at).toLocaleString() : "None scheduled"}</p>
              <p>Received: {new Date(selected.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted">Follow-up state</p>
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    disabled={updating || selected.status === stage}
                    onClick={() => updateStatus(selected.id, stage)}
                    className="rounded-sx-pill border border-sx-border-strong bg-sx-surface-2 px-2.5 py-1 text-[11.5px] text-sx-text-muted transition-colors hover:bg-sx-elevated hover:text-sx-text disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {LEAD_STATUS_CHIP[stage].label}
                  </button>
                ))}
              </div>
            </div>
            <Link href={`/app/crm/${selected.id}`} className="text-xs text-sx-accent hover:underline">
              Open full lead page →
            </Link>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
