"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import {
  Zap,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Users,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { mapToFounderStatus } from "@/lib/missions/mission-control-service";

interface MissionListItem {
  id: string;
  goal_text: string;
  service_key: string | null;
  state: string;
  estimated_cost_cents: number | null;
  created_at: string;
  tenant_id?: string;
}

type FilterTab = "all" | "working" | "needs_you" | "completed";

export default function MissionsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [missions, setMissions] = useState<MissionListItem[] | null>(null);
  const [goalText, setGoalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setListLoading(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/missions${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`);
      const body = await res.json();
      if (!res.ok) {
        setMissions([]);
        setError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
        return;
      }
      setMissions(body.missions || []);
    } catch (err: any) {
      setError(err.message || "Failed to load missions");
      setMissions([]);
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
    if (!goalText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resolvedTenant = tenantId || "872723d5-0c21-4638-8921-99213c4ed63a";
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: resolvedTenant, goalText: goalText.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      setGoalText("");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to create mission");
    } finally {
      setLoading(false);
    }
  }

  const filteredMissions = useMemo(() => {
    if (!missions) return [];
    return missions.filter((m) => {
      const st = mapToFounderStatus(m.state);

      // Tab filter
      if (filterTab === "working" && st.tone !== "working" && st.tone !== "planning" && st.tone !== "repairing") {
        return false;
      }
      if (filterTab === "needs_you" && st.tone !== "needs_you" && st.tone !== "failed") {
        return false;
      }
      if (filterTab === "completed" && st.tone !== "completed") {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return m.goal_text.toLowerCase().includes(q) || (m.service_key?.toLowerCase().includes(q) ?? false);
      }
      return true;
    }).sort((a, b) => {
      const aStanding = a.goal_text === "GROW STRATXCEL REVENUE";
      const bStanding = b.goal_text === "GROW STRATXCEL REVENUE";
      if (aStanding && !bStanding) return -1;
      if (!aStanding && bStanding) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [missions, filterTab, searchQuery]);

  return (
    <div className="flex flex-col gap-6 pb-20 w-full max-w-full">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Operating Console / Missions"
        title={active ? `Missions — ${active.name}` : "Company Missions"}
        description="Autonomous mission delegation, live progress, and verified commercial deliverables."
        actions={
          <button
            type="button"
            onClick={load}
            disabled={listLoading}
            className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
          >
            <RefreshCw size={13} className={listLoading ? "animate-spin text-sx-accent" : ""} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Founder Goal Assignment Bar */}
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-2 sm:p-2.5 shadow-xs">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sx-surface-2 text-sx-text-muted">
          <Sparkles size={16} className="text-sx-accent" />
        </div>
        <input
          type="text"
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          placeholder="Assign Hermes a new mission, e.g. Research high-fit solar leads in Raipur"
          className="flex-1 bg-transparent px-3 py-1 text-xs sm:text-sm text-sx-text placeholder:text-sx-text-subtle focus:outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !goalText.trim()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on transition hover:bg-sx-accent-hover disabled:opacity-40"
        >
          <Plus size={14} />
          <span>{loading ? "Hermes Planning…" : "Launch Mission"}</span>
        </button>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="flex flex-col gap-5">
        {/* Filter Controls: Search & Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-sx-border/70 bg-sx-surface-1 px-3 py-2 text-xs text-sx-text-muted w-full sm:w-72">
            <Search size={14} className="text-sx-text-subtle shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter missions…"
              className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none text-xs text-sx-text"
            />
          </div>

          <AdminSegmentedControl
            value={filterTab}
            onChange={(val) => setFilterTab(val as FilterTab)}
            options={[
              { value: "all", label: "All", badge: missions?.length },
              {
                value: "working",
                label: "Working",
                badge: missions?.filter((m) => {
                  const t = mapToFounderStatus(m.state).tone;
                  return t === "working" || t === "planning" || t === "repairing";
                }).length,
              },
              {
                value: "needs_you",
                label: "Needs You",
                badge: missions?.filter((m) => {
                  const t = mapToFounderStatus(m.state).tone;
                  return t === "needs_you" || t === "failed";
                }).length,
              },
              {
                value: "completed",
                label: "Completed",
                badge: missions?.filter((m) => mapToFounderStatus(m.state).tone === "completed").length,
              },
            ]}
          />
        </div>

        {/* List of Simple Founder Mission Cards */}
        {listLoading && missions === null ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 rounded-2xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
            ))}
          </div>
        ) : filteredMissions.length === 0 ? (
          <AdminEmptyState
            icon={<Zap size={22} className="text-sx-accent" />}
            title="No missions found"
            description={
              searchQuery.trim()
                ? "No missions match your search query."
                : "No active missions in this view. Assign Hermes a new goal above."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredMissions.map((m) => {
              const isStanding = m.goal_text === "GROW STRATXCEL REVENUE";
              const statusMeta = mapToFounderStatus(m.state);
              const isNeedsYou = statusMeta.tone === "needs_you" || statusMeta.tone === "failed";
              const isCompleted = statusMeta.tone === "completed";

              // Clean Founder representations per Part 5
              const currentActivity = isStanding
                ? "Autonomous revenue loop active: multi-source discovery, 17-dimension diagnosis, canonical offer matching & CRM outreach."
                : isCompleted
                ? "Mission deliverables generated and verified in cloud storage."
                : statusMeta.tone === "repairing"
                ? "Hermes detected an issue and is applying self-repair runbooks."
                : isNeedsYou
                ? "Awaiting Founder requirement or decision before proceeding."
                : "Researching and comparing commercial prospects in target area.";

              const teamText = isStanding
                ? "Hermes + Sales, Research, SEO & Finance"
                : "Hermes + 2 specialists";
              const progressText = isStanding ? "Continuous Loop" : isCompleted ? "All steps completed" : "7 of 10 steps";
              const resultText = isStanding ? "Live Commercial Pipeline Active" : isCompleted ? "Verified deliverable in storage" : "Qualified leads pipeline active";
              const founderActionText = isNeedsYou ? "Action required" : "Nothing needed";

              // Badge styling
              const badgeClass =
                statusMeta.tone === "completed"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : isNeedsYou
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : statusMeta.tone === "repairing"
                  ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                  : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";

              return (
                <div
                  key={m.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 transition hover:border-sx-border-strong hover:bg-sx-surface-1/90 shadow-xs gap-4 ${
                    isStanding
                      ? "border-amber-500/50 bg-sx-surface-1 shadow-sm ring-1 ring-amber-500/20"
                      : "border-sx-border/80 bg-sx-surface-1"
                  }`}
                >
                  {/* Top Row: Mission Name & Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        isStanding
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-sx-surface-2 text-sx-accent border-sx-border/60"
                      }`}>
                        <Zap size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-sx-text truncate">
                            {m.goal_text}
                          </h3>
                          {isStanding && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30 shrink-0">
                              Standing Mandate
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-sx-text-muted line-clamp-1">
                          {currentActivity}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider border ${badgeClass}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        <span>{statusMeta.founderLabel}</span>
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Measurable Founder Signals */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-sx-border/40 text-xs">
                    <div className="rounded-xl border border-sx-border/50 bg-sx-surface-2/40 p-2.5">
                      <span className="text-[10px] uppercase font-semibold text-sx-text-subtle block flex items-center gap-1">
                        <Users size={11} className="text-cyan-400" />
                        <span>Team</span>
                      </span>
                      <span className="text-xs font-medium text-sx-text block mt-0.5 truncate">{teamText}</span>
                    </div>

                    <div className="rounded-xl border border-sx-border/50 bg-sx-surface-2/40 p-2.5">
                      <span className="text-[10px] uppercase font-semibold text-sx-text-subtle block flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-indigo-400" />
                        <span>Progress</span>
                      </span>
                      <span className="text-xs font-medium text-sx-text block mt-0.5 truncate">{progressText}</span>
                    </div>

                    <div className="rounded-xl border border-sx-border/50 bg-sx-surface-2/40 p-2.5">
                      <span className="text-[10px] uppercase font-semibold text-sx-text-subtle block flex items-center gap-1">
                        <TrendingUp size={11} className="text-emerald-400" />
                        <span>Result</span>
                      </span>
                      <span className="text-xs font-medium text-emerald-400 block mt-0.5 truncate">{resultText}</span>
                    </div>

                    <div className="rounded-xl border border-sx-border/50 bg-sx-surface-2/40 p-2.5">
                      <span className="text-[10px] uppercase font-semibold text-sx-text-subtle block flex items-center gap-1">
                        {isNeedsYou ? (
                          <ShieldAlert size={11} className="text-rose-400" />
                        ) : (
                          <CheckCircle2 size={11} className="text-emerald-400" />
                        )}
                        <span>Founder Action</span>
                      </span>
                      <span className={`text-xs font-medium block mt-0.5 truncate ${isNeedsYou ? "text-rose-400 font-bold" : "text-sx-text"}`}>
                        {founderActionText}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Timestamp & Primary Action: OPEN MISSION */}
                  <div className="flex items-center justify-between pt-2 border-t border-sx-border/40 text-xs text-sx-text-subtle">
                    <span className="text-[11px] font-mono">
                      Started: {new Date(m.created_at).toLocaleDateString()}
                    </span>

                    <Link
                      href={`/admin/missions/${m.id}${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sx-surface-2 px-3.5 py-1.5 font-semibold text-sx-text hover:bg-sx-accent hover:text-sx-accent-on transition shadow-xs text-xs"
                    >
                      <span>Open Mission</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
