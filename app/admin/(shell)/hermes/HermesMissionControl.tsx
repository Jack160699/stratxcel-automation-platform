"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminUniversalDrawer, AdminDrawerSection, AdminDrawerRow } from "@/components/admin/ui/AdminUniversalDrawer";
import { RefreshCw, Activity, Cpu, Shield, Zap, Wrench, AlertTriangle } from "lucide-react";
import type { HermesTelemetry, SignalState } from "@/lib/hermes/mission-control";

const SIGNAL_STATUS_MAP: Record<SignalState, string> = {
  healthy: "connected",
  degraded: "needs_attention",
  offline: "error",
  unavailable: "disabled",
  not_monitored: "paused",
};

const fmt = (v: number | null, suffix = "") => (v == null ? "—" : `${v.toLocaleString()}${suffix}`);
const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

function Sparkline({ values, tone = "stroke-sx-ai" }: { values: number[]; tone?: string }) {
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" className={tone} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function HermesMissionControl() {
  const [data, setData] = useState<HermesTelemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMission, setSelectedMission] = useState<HermesTelemetry["missions"][number] | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/platform/admin/hermes/telemetry", { cache: "no-store" });
      if (!r.ok) throw new Error(`Telemetry unavailable (HTTP ${r.status})`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Telemetry unavailable");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) {
    return (
      <div className="flex flex-col gap-6 pb-16">
        <AdminPageHeader
          breadcrumb="Missions / Hermes"
          title="Hermes Mission Control"
          description="Live, evidence-backed observability for the production autonomous mission engine."
        />
        <div className="flex flex-col items-center justify-center rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-12 text-center">
          <Activity size={24} className="animate-spin text-sx-accent" />
          <p className="mt-3 text-xs text-sx-text-muted">{error ?? "Connecting to Hermes telemetry gateway…"}</p>
        </div>
      </div>
    );
  }

  const recent = data.trends.slice(-24);
  const statusEntries = [
    { name: "Hermes Engine", state: data.status.engine.state, label: data.status.engine.label },
    { name: "Mission Worker", state: data.status.missionWorker.state, label: data.status.missionWorker.label },
    { name: "MCP Gateway", state: data.status.mcpGateway.state, label: data.status.mcpGateway.label },
    { name: "Provider Router", state: data.status.provider.state, label: data.status.provider.label },
    { name: "Mission Queue", state: data.status.queue.state, label: data.status.queue.label },
  ];

  return (
    <div className="flex flex-col gap-7 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Missions / Hermes"
        title="Hermes Mission Control"
        description="Autonomous mission planner, specialist delegator, and live runtime telemetry."
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden font-sx-mono text-[11px] text-sx-text-subtle sm:inline">
              Last updated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={load}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Top Level System Heartbeat Bar */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statusEntries.map((item) => (
          <div
            key={item.name}
            className="flex flex-col justify-between rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5"
          >
            <span className="text-[11px] font-medium text-sx-text-muted truncate">{item.name}</span>
            <div className="mt-2 flex items-center justify-between">
              <AdminStatusDot status={SIGNAL_STATUS_MAP[item.state] ?? "paused"} compact />
              <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">
                {item.label.replaceAll("_", " ")}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Core KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Runs Today</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-text">{fmt(data.kpis.runsToday)}</p>
        </div>
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Success Rate</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-[#5BDCA7]">{fmt(data.kpis.successRate, "%")}</p>
        </div>
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Avg Latency</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-text">{data.kpis.avgLatencyMs ? `${data.kpis.avgLatencyMs}ms` : "—"}</p>
        </div>
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Active Missions</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-ai">{fmt(data.kpis.activeMissions)}</p>
        </div>
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Tool Success</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-text">{fmt(data.kpis.toolSuccessRate, "%")}</p>
        </div>
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
          <span className="text-[11px] font-medium text-sx-text-muted">Tokens Processed</span>
          <p className="mt-1 font-sx-sans text-xl font-bold text-sx-text">{fmt(data.kpis.tokenUsage)}</p>
        </div>
      </section>

      {/* 24-Hour Trends */}
      <section className="grid gap-3.5 sm:grid-cols-3">
        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-sx-text">24h Missions &amp; Failures</span>
            <span className="text-[10px] font-sx-mono text-sx-text-subtle">Success / Failure</span>
          </div>
          <Sparkline values={recent.map((x) => x.success)} tone="stroke-[#5BDCA7]" />
          <Sparkline values={recent.map((x) => x.failure)} tone="stroke-[#FF8A90]" />
        </div>

        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-sx-text">Queue Latency Trend</span>
            <span className="text-[10px] font-sx-mono text-sx-text-subtle">avg ms</span>
          </div>
          <Sparkline values={recent.map((x) => x.avgLatencyMs ?? 0)} tone="stroke-sx-accent" />
        </div>

        <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-sx-text">Hourly Throughput</span>
            <span className="text-[10px] font-sx-mono text-sx-text-subtle">created / hr</span>
          </div>
          <Sparkline values={recent.map((x) => x.missions)} tone="stroke-sx-ai" />
        </div>
      </section>

      {/* Live Mission Lane & Tool Activity */}
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Live Mission Lane */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-sx-accent" />
              <h2 className="text-sm font-semibold text-sx-text">Live Mission Lane</h2>
            </div>
            <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">
              7-Day Activity
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {data.missions.length === 0 ? (
              <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-6 text-center text-xs text-sx-text-muted">
                No active or recent missions in the last 7 days.
              </div>
            ) : (
              data.missions.slice(0, 10).map((m) => {
                const isSuccess = m.state === "COMPLETED";
                const isFail = m.state === "FAILED" || m.state === "BLOCKED";
                const isRunning = m.state === "RUNNING";
                const statusKey = isSuccess ? "connected" : isFail ? "error" : isRunning ? "running" : "waiting";

                return (
                  <AdminEntityRow
                    key={m.id}
                    icon={<Cpu size={15} className="text-sx-accent" />}
                    title={`Mission ${short(m.id)} · Run ${short(m.runId)}`}
                    subtitle={m.currentStep ?? "Execution in progress"}
                    timestamp={`${Math.max(0, Math.round((Date.now() - new Date(m.createdAt).getTime()) / 60000))}m ago`}
                    status={<AdminStatusDot status={statusKey} customLabel={m.state} />}
                    onOpenDetails={() => setSelectedMission(m)}
                    detailsAriaLabel={`Inspect live mission ${m.id}`}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* MCP & Tool Activity */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={15} className="text-sx-text-muted" />
              <h2 className="text-sm font-semibold text-sx-text">MCP Tool Activity</h2>
            </div>
            <span className="font-sx-mono text-[10px] text-sx-text-subtle">
              {fmt(data.tools.registered)} Registered
            </span>
          </div>

          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <div className="grid grid-cols-2 gap-2 pb-3 text-xs border-b border-sx-border/60">
              <div>
                <span className="text-sx-text-subtle">Successful Calls</span>
                <p className="font-bold text-[#5BDCA7]">{fmt(data.tools.successful)}</p>
              </div>
              <div>
                <span className="text-sx-text-subtle">Denied Calls</span>
                <p className="font-bold text-[#FF8A90]">{fmt(data.tools.denied)}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {data.tools.byType.slice(0, 6).map((t) => (
                <div key={t.name} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate text-sx-text font-medium">{t.name}</span>
                  <span className="font-sx-mono text-sx-text-muted">{t.calls.toLocaleString()} calls</span>
                </div>
              ))}
            </div>
          </div>

          {/* Infrastructure Heartbeats */}
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-sx-accent" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                Worker Heartbeats
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {data.workers.map((w) => (
                <div key={w.type} className="flex items-center justify-between text-xs py-1 border-b border-sx-border/40 last:border-0">
                  <span className="text-sx-text font-medium">{w.type}</span>
                  <AdminStatusDot status={SIGNAL_STATUS_MAP[w.state] ?? "paused"} customLabel={w.status} compact />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Drawer for Live Mission */}
      {selectedMission && (
        <AdminUniversalDrawer
          open={Boolean(selectedMission)}
          onClose={() => setSelectedMission(null)}
          entityType="HERMES TELEMETRY RECORD"
          title={`Mission ${short(selectedMission.id)}`}
          subtitle={`Run ${selectedMission.runId ?? "N/A"}`}
          icon={<Cpu size={20} className="text-sx-accent" />}
          statusBadge={<AdminStatusDot status={selectedMission.state === "COMPLETED" ? "connected" : selectedMission.state === "FAILED" ? "error" : "running"} customLabel={selectedMission.state} />}
        >
          <AdminDrawerSection title="Identifiers">
            <AdminDrawerRow label="Mission ID" value={selectedMission.id} mono />
            <AdminDrawerRow label="Run ID" value={selectedMission.runId ?? "None"} mono />
            <AdminDrawerRow label="Correlation ID" value={selectedMission.correlationId ?? "None"} mono />
          </AdminDrawerSection>

          <AdminDrawerSection title="Step & Progress">
            <AdminDrawerRow label="Current Step" value={selectedMission.currentStep ?? "Unavailable"} />
            <AdminDrawerRow label="Created At" value={new Date(selectedMission.createdAt).toLocaleString()} />
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
