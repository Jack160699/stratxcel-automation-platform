"use client";

import { useEffect, useState, useMemo } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminUniversalDrawer, AdminDrawerSection, AdminDrawerRow } from "@/components/admin/ui/AdminUniversalDrawer";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { Zap, Plus, RefreshCw, Search, Sparkles } from "lucide-react";

interface Mission {
  id: string;
  goal_text: string;
  service_key: string | null;
  state: string;
  estimated_cost_cents: number | null;
  created_at: string;
}

const STATE_MAP: Record<string, { label: string; status: string }> = {
  DRAFT: { label: "Draft", status: "paused" },
  ESTIMATING: { label: "Estimating", status: "waiting" },
  AWAITING_FUNDS: { label: "Awaiting funds", status: "needs_attention" },
  READY: { label: "Ready", status: "healthy" },
  QUEUED: { label: "Queued", status: "waiting" },
  RUNNING: { label: "Running", status: "running" },
  AWAITING_INPUT: { label: "Awaiting input", status: "needs_attention" },
  AWAITING_APPROVAL: { label: "Awaiting approval", status: "needs_attention" },
  HUMAN_HANDOFF: { label: "Human handoff", status: "needs_attention" },
  RESUMED: { label: "Resumed", status: "running" },
  COMPLETED: { label: "Completed", status: "connected" },
  PARTIALLY_COMPLETED: { label: "Partially completed", status: "connected" },
  FAILED: { label: "Failed", status: "error" },
  CANCELLED: { label: "Cancelled", status: "disabled" },
  BLOCKED: { label: "Blocked", status: "error" },
};

type FilterTab = "all" | "active" | "completed" | "attention";

export default function MissionsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [goalText, setGoalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!tenantId || !goalText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText: goalText.trim() }),
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

  const filteredMissions = useMemo(() => {
    if (!missions) return [];
    return missions.filter((m) => {
      // Tab filter
      if (filterTab === "active" && !["RUNNING", "QUEUED", "ESTIMATING", "RESUMED"].includes(m.state)) return false;
      if (filterTab === "completed" && !["COMPLETED", "PARTIALLY_COMPLETED"].includes(m.state)) return false;
      if (filterTab === "attention" && !["AWAITING_APPROVAL", "AWAITING_INPUT", "HUMAN_HANDOFF", "FAILED", "BLOCKED"].includes(m.state)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return m.goal_text.toLowerCase().includes(q) || (m.service_key?.toLowerCase().includes(q) ?? false);
      }
      return true;
    });
  }, [missions, filterTab, searchQuery]);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Missions / All Missions"
        title={active ? `Missions — ${active.name}` : "Missions"}
        description="Autonomous mission planner, specialist delegator, and goal execution logs."
        actions={
          <button
            type="button"
            onClick={load}
            disabled={listLoading}
            className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
          >
            <RefreshCw size={13} className={listLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Create Mission Bar */}
      {tenantId && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 rounded-xl border border-sx-border/80 bg-sx-surface-1 p-2 shadow-xs">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sx-surface-2 text-sx-text-muted">
            <Sparkles size={15} className="text-sx-accent" />
          </div>
          <input
            type="text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="Assign Hermes a new goal, e.g. Audit SEO backlinks for our website"
            className="flex-1 bg-transparent px-2 text-xs text-sx-text placeholder:text-sx-text-subtle focus:outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !goalText.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-sx-accent-on transition-colors hover:bg-sx-accent-hover disabled:opacity-40"
          >
            <Plus size={14} />
            <span>{loading ? "Planning…" : "Create Mission"}</span>
          </button>
        </form>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {!tenantId ? (
        <NoClientSelected what="missions" />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Controls: Search & Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-sx-border/70 bg-sx-surface-1 px-3 py-1.5 text-xs text-sx-text-muted w-full sm:w-64">
              <Search size={14} className="text-sx-text-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search missions…"
                className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none"
              />
            </div>

            <AdminSegmentedControl
              value={filterTab}
              onChange={(val) => setFilterTab(val)}
              options={[
                { value: "all", label: "All", badge: missions?.length },
                {
                  value: "active",
                  label: "Active",
                  badge: missions?.filter((m) => ["RUNNING", "QUEUED", "RESUMED"].includes(m.state)).length,
                },
                {
                  value: "attention",
                  label: "Attention",
                  badge: missions?.filter((m) => ["AWAITING_APPROVAL", "FAILED", "BLOCKED"].includes(m.state)).length,
                },
                {
                  value: "completed",
                  label: "Completed",
                  badge: missions?.filter((m) => ["COMPLETED", "PARTIALLY_COMPLETED"].includes(m.state)).length,
                },
              ]}
            />
          </div>

          {/* List or Empty State */}
          {listLoading && missions === null ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 rounded-sx-md border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
              ))}
            </div>
          ) : filteredMissions.length === 0 ? (
            <AdminEmptyState
              icon={<Zap size={20} />}
              title="No missions found"
              description={
                searchQuery.trim()
                  ? "No missions match your search query."
                  : "No missions have been created for this client workspace yet."
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMissions.map((m) => {
                const stateMeta = STATE_MAP[m.state] ?? { label: m.state, status: "paused" };
                const costDisplay = m.estimated_cost_cents != null ? `₹${(m.estimated_cost_cents / 100).toFixed(2)}` : null;

                return (
                  <AdminEntityRow
                    key={m.id}
                    icon={<Zap size={16} className="text-sx-accent" />}
                    title={m.goal_text}
                    subtitle={
                      <span>
                        {m.service_key ? `Service: ${m.service_key}` : "Hermes General"}
                        {costDisplay ? ` · Est. cost: ${costDisplay}` : ""}
                      </span>
                    }
                    timestamp={new Date(m.created_at).toLocaleDateString()}
                    status={<AdminStatusDot status={stateMeta.status} customLabel={stateMeta.label} />}
                    onOpenDetails={() => setSelectedMission(m)}
                    detailsAriaLabel={`Inspect mission ${m.id}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Universal Detail Drawer */}
      {selectedMission && (
        <AdminUniversalDrawer
          open={Boolean(selectedMission)}
          onClose={() => setSelectedMission(null)}
          entityType="AUTONOMOUS MISSION"
          title={selectedMission.goal_text}
          subtitle={`Mission ${selectedMission.id.slice(0, 8)}…`}
          icon={<Zap size={20} className="text-sx-accent" />}
          statusBadge={
            <AdminStatusDot
              status={STATE_MAP[selectedMission.state]?.status ?? "paused"}
              customLabel={STATE_MAP[selectedMission.state]?.label ?? selectedMission.state}
            />
          }
        >
          <AdminDrawerSection title="Overview">
            <AdminDrawerRow label="Mission ID" value={selectedMission.id} mono />
            <AdminDrawerRow label="Execution State" value={selectedMission.state} />
            <AdminDrawerRow label="Service Key" value={selectedMission.service_key ?? "Unassigned (Hermes General)"} />
            <AdminDrawerRow
              label="Estimated Cost"
              value={
                selectedMission.estimated_cost_cents != null
                  ? `₹${(selectedMission.estimated_cost_cents / 100).toFixed(2)}`
                  : "Not estimated"
              }
            />
            <AdminDrawerRow label="Created At" value={new Date(selectedMission.created_at).toLocaleString()} />
          </AdminDrawerSection>

          <AdminDrawerSection title="Execution Details">
            <p className="text-xs text-sx-text-muted leading-relaxed">
              This mission is executed through the Hermes Autonomous Engine. Specialist tools and capability runtime
              are dynamically selected based on the goal statement.
            </p>
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
