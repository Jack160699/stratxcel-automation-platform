"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface Mission {
  id: string;
  goal_text: string;
  service_key: string | null;
  state: string;
  estimated_cost_cents: number | null;
  created_at: string;
}

const MISSION_STATE_CHIP: Record<string, { label: string; state: ChipState }> = {
  DRAFT: { label: "Draft", state: "neutral" },
  ESTIMATING: { label: "Estimating", state: "neutral" },
  AWAITING_FUNDS: { label: "Awaiting funds", state: "warning" },
  READY: { label: "Ready", state: "accent" },
  QUEUED: { label: "Queued", state: "accent" },
  RUNNING: { label: "Running", state: "ai" },
  AWAITING_INPUT: { label: "Awaiting input", state: "warning" },
  AWAITING_APPROVAL: { label: "Awaiting approval", state: "warning" },
  HUMAN_HANDOFF: { label: "Human handoff", state: "warning" },
  RESUMED: { label: "Resumed", state: "accent" },
  COMPLETED: { label: "Completed", state: "success" },
  PARTIALLY_COMPLETED: { label: "Partially completed", state: "success" },
  FAILED: { label: "Failed", state: "danger" },
  CANCELLED: { label: "Cancelled", state: "neutral" },
  BLOCKED: { label: "Blocked", state: "danger" },
};

export default function MissionsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [goalText, setGoalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setMissions([]);
        setError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
        return;
      }
      setMissions(body.missions);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      setGoalText("");
      await load();
    } finally {
      setLoading(false);
    }
  }

  const columns: DataTableColumn<Mission>[] = [
    { key: "goal", header: "Goal", render: (m) => <span title={m.goal_text}>{m.goal_text}</span> },
    { key: "service", header: "Service", render: (m) => m.service_key ?? "—" },
    {
      key: "state",
      header: "State",
      mobilePrimary: true,
      render: (m) => {
        const chip = MISSION_STATE_CHIP[m.state] ?? { label: m.state, state: "neutral" as ChipState };
        return (
          <StatusChip state={chip.state} pulse={chip.state === "ai"}>
            {chip.label}
          </StatusChip>
        );
      },
    },
    {
      key: "cost",
      header: "Est. cost",
      render: (m) => (m.estimated_cost_cents != null ? `₹${(m.estimated_cost_cents / 100).toFixed(2)}` : "—"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Missions{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {tenantId && (
        <section className="flex flex-col gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Create a mission</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              required
              placeholder="e.g. Run an Instagram campaign for our spring sale"
              className="flex-1"
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Creating…" : "Create + estimate"}
            </Button>
          </form>
          {error && <ErrorState message={error} />}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Missions</h2>
        {!tenantId && <NoClientSelected what="missions" />}
        {tenantId && listLoading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenantId && !listLoading && missions?.length === 0 && !error && <p className="text-sm text-sx-text-subtle">No missions yet.</p>}
        {tenantId && !listLoading && error && missions?.length === 0 && <ErrorState message={error} onRetry={load} />}
        {missions && missions.length > 0 && <DataTable columns={columns} rows={missions} />}
      </section>
    </div>
  );
}
