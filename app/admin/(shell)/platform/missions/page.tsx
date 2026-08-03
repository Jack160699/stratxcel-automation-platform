"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";

interface Mission {
  id: string;
  goal_text: string;
  service_key: string | null;
  state: string;
  estimated_cost_cents: number | null;
  created_at: string;
}

const STATE_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-600/20 text-slate-400",
  ESTIMATING: "bg-slate-600/20 text-slate-400",
  AWAITING_FUNDS: "bg-amber-400/15 text-amber-300",
  READY: "bg-sky-400/15 text-sky-300",
  QUEUED: "bg-sky-400/15 text-sky-300",
  RUNNING: "bg-sky-400/25 text-sky-200",
  AWAITING_INPUT: "bg-amber-400/15 text-amber-300",
  AWAITING_APPROVAL: "bg-amber-400/15 text-amber-300",
  HUMAN_HANDOFF: "bg-orange-400/15 text-orange-300",
  RESUMED: "bg-sky-400/15 text-sky-300",
  COMPLETED: "bg-emerald-400/15 text-emerald-300",
  PARTIALLY_COMPLETED: "bg-emerald-400/10 text-emerald-400",
  FAILED: "bg-rose-400/15 text-rose-300",
  CANCELLED: "bg-slate-600/20 text-slate-500",
  BLOCKED: "bg-rose-400/15 text-rose-300",
};

export default function MissionsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [goalText, setGoalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
      return;
    }
    setMissions(body.missions);
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Missions{active ? ` — ${active.name}` : ""}</h1>
      </header>

      {tenantId && (
        <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-medium text-slate-200">Create a mission</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              required
              placeholder="e.g. Run an Instagram campaign for our spring sale"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create + estimate"}
            </button>
          </form>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Missions</h2>
        {!tenantId && <NoClientSelected what="missions" />}
        {tenantId && missions === null && <p className="text-sm text-slate-500">Loading…</p>}
        {tenantId && missions?.length === 0 && <p className="text-sm text-slate-500">No missions yet.</p>}
        {missions && missions.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Goal</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.id} className="border-t border-slate-800">
                    <td className="max-w-xs truncate px-4 py-3 text-slate-200" title={m.goal_text}>
                      {m.goal_text}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{m.service_key ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[m.state] ?? "bg-slate-600/20 text-slate-400"}`}>
                        {m.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {m.estimated_cost_cents != null ? `₹${(m.estimated_cost_cents / 100).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
