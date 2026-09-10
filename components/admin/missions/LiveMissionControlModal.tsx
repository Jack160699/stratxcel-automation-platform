"use client";

import { useEffect, useState } from "react";
import {
  X,
  Zap,
  Clock,
  Users,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  ArrowRight,
  TrendingUp,
  Search,
  Sparkles,
  Bot,
  Layers,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  BrainCircuit,
  MessageSquare,
  Database,
  Briefcase,
} from "lucide-react";
import type {
  MissionControlPayload,
  MissionControlState,
  LiveTimelineEvent,
  AgentParticipant,
  ToolMcpActivity,
} from "@/lib/missions/mission-control-service";

interface LiveMissionControlModalProps {
  missionId: string;
  tenantId: string;
  onClose: () => void;
}

const STATE_BADGE_STYLES: Record<MissionControlState, { bg: string; text: string; border: string; label: string }> = {
  PLANNING: { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/30", label: "Planning" },
  RESEARCHING: { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30", label: "Researching" },
  EXECUTING: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", label: "Executing" },
  WAITING_FOR_TOOL: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", label: "Waiting for Tool" },
  WAITING_FOR_FOUNDER: { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30", label: "Waiting for Founder" },
  WAITING_FOR_EXTERNAL: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", label: "Waiting for External" },
  BLOCKED: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/40", label: "Blocked" },
  RETRYING: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", label: "Retrying" },
  REPAIRING: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40", label: "Self-Repairing" },
  VERIFYING: { bg: "bg-teal-500/15", text: "text-teal-400", border: "border-teal-500/30", label: "Verifying" },
  COMPLETED: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40", label: "Completed" },
  FAILED: { bg: "bg-zinc-500/20", text: "text-zinc-400", border: "border-zinc-500/30", label: "Failed" },
};

export function LiveMissionControlModal({ missionId, tenantId, onClose }: LiveMissionControlModalProps) {
  const [data, setData] = useState<MissionControlPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "agents" | "tools" | "artifacts" | "contract">("overview");
  const [selectedEvent, setSelectedEvent] = useState<LiveTimelineEvent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentParticipant | null>(null);
  const [copied, setCopied] = useState(false);

  // Live ticking elapsed time
  const [elapsedSecs, setElapsedSecs] = useState(0);

  async function loadData(isSilent = false) {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/missions/${encodeURIComponent(missionId)}/control?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: MissionControlPayload = await res.json();
      setData(json);
      setElapsedSecs(Math.floor(json.header.elapsedMs / 1000));
    } catch (err: any) {
      setError(err.message || "Failed to load mission control data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, tenantId]);

  // Elapsed ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setElapsedSecs((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  function formatDuration(totalSeconds: number) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function handleCopyId() {
    navigator.clipboard.writeText(missionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const badge = data ? STATE_BADGE_STYLES[data.header.state] || STATE_BADGE_STYLES.EXECUTING : STATE_BADGE_STYLES.EXECUTING;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-6xl max-h-[92vh] rounded-2xl border border-zinc-800 bg-[#090b10] text-zinc-100 shadow-2xl overflow-hidden">
        {/* ========================================================================= */}
        {/* TOP BAR: MISSION HEADER                                                   */}
        {/* ========================================================================= */}
        <div className="flex flex-col border-b border-zinc-800/80 bg-zinc-950/70 p-4 sm:p-5 gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400">
                <Zap size={20} className="animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Autonomous Mission Control</span>
                  <span className="text-zinc-600">•</span>
                  <button
                    onClick={handleCopyId}
                    className="flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    title="Copy Mission ID"
                  >
                    <span>ID: {missionId.slice(0, 8)}…</span>
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                  <span className="text-zinc-600">•</span>
                  <span className="text-xs text-zinc-400 font-mono">{data?.header.serviceKey || "hermes_general"}</span>
                </div>
                <h2 className="mt-1 text-base sm:text-lg font-semibold text-zinc-100 truncate">
                  {data?.header.goalText || "Loading Mission Goal..."}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin text-cyan-400" : ""} />
                <span className="hidden sm:inline">Live</span>
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition"
                aria-label="Close Mission Control"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Metrics bar */}
          {data && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/40 text-xs text-zinc-400">
              <div className="flex flex-wrap items-center gap-3">
                {/* 12-State Badge */}
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold uppercase tracking-wider text-[11px] border ${badge.bg} ${badge.text} ${badge.border}`}>
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  <span>{badge.label}</span>
                </div>

                {/* Elapsed Live Timer */}
                <div className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1 border border-zinc-800/80 font-mono text-zinc-300">
                  <Clock size={13} className="text-cyan-400" />
                  <span>Elapsed: {formatDuration(elapsedSecs)}</span>
                </div>

                {/* Active Workers */}
                <div className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1 border border-zinc-800/80 text-zinc-300">
                  <Users size={13} className="text-indigo-400" />
                  <span>{data.header.workerCount} Specialists</span>
                </div>

                {/* Connected Tools */}
                <div className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1 border border-zinc-800/80 text-zinc-300">
                  <Wrench size={13} className="text-amber-400" />
                  <span>{data.header.toolCount} Tools Connected</span>
                </div>
              </div>

              {/* Progress & Cost */}
              <div className="flex items-center gap-4">
                {data.header.estimatedCostCents != null && (
                  <div className="text-zinc-400">
                    Est. Cost: <span className="text-zinc-200 font-medium">₹{(data.header.estimatedCostCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Progress:</span>
                  <div className="h-2 w-24 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${data.header.progressPercent}%` }}
                    />
                  </div>
                  <span className="font-mono font-semibold text-cyan-400">{data.header.progressPercent}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CURRENT ACTION BANNER (Zero Generic Working)                              */}
        {/* ========================================================================= */}
        {data && (
          <div className="relative border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-zinc-950/40 p-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs uppercase">
                  {data.currentAction.agentName.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wide">
                      {data.currentAction.agentName}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium">
                      ({data.currentAction.agentRole})
                    </span>
                    <span className="text-[10px] rounded bg-cyan-500/20 px-1.5 py-0.2 text-cyan-300 border border-cyan-500/30">
                      {data.currentAction.department} Pod
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm font-medium text-zinc-100 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span>{data.currentAction.currentAction}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:text-right">
                <div className="rounded-lg bg-black/40 border border-zinc-800 px-3 py-1 text-xs">
                  <span className="text-zinc-500 block text-[10px] uppercase">Real Output</span>
                  <span className="font-semibold text-emerald-400">{data.currentAction.realResultSummary}</span>
                </div>
                <div className="rounded-lg bg-black/40 border border-zinc-800 px-3 py-1 text-xs">
                  <span className="text-zinc-500 block text-[10px] uppercase">Next Step</span>
                  <span className="text-zinc-300 flex items-center gap-1">
                    <ArrowRight size={12} className="text-cyan-400" />
                    {data.currentAction.nextStep}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* NAVIGATION TABS                                                           */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-1 border-b border-zinc-800 px-4 sm:px-6 bg-zinc-950/40 text-xs overflow-x-auto">
          {[
            { key: "overview", label: "Overview & Metrics", icon: Activity },
            { key: "timeline", label: `Live Timeline (${data?.timeline.length || 0})`, icon: Clock },
            { key: "agents", label: `Active Specialists (${data?.agents.length || 0})`, icon: Users },
            { key: "tools", label: `Tools & MCPs (${data?.toolActivity.length || 0})`, icon: Wrench },
            { key: "artifacts", label: `Artifacts (${data?.artifacts.length || 0})`, icon: FileText },
            { key: "contract", label: "Completion Contract", icon: CheckCircle2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-medium transition whitespace-nowrap ${
                  isActive
                    ? "border-cyan-400 text-cyan-400 font-semibold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* MODAL BODY CONTENT                                                        */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <RefreshCw size={24} className="animate-spin text-cyan-400" />
              <p className="text-sm">Connecting to Autonomous Mission Bus…</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              {/* TAB 1: OVERVIEW & BUSINESS OUTPUTS */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Business Outputs Card */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-emerald-400" />
                      <span>Verified Business Outputs (Non-Synthetic)</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Leads Discovered</span>
                        <span className="text-lg sm:text-xl font-bold text-zinc-100">{data.businessOutputs.leadsDiscovered}</span>
                        <span className="text-[10px] text-cyan-400 block mt-0.5">Places / Maps</span>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Qualified</span>
                        <span className="text-lg sm:text-xl font-bold text-emerald-400">{data.businessOutputs.leadsQualified}</span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">Canonical verified</span>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Outreach Sent</span>
                        <span className="text-lg sm:text-xl font-bold text-indigo-400">{data.businessOutputs.outreachDispatched}</span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">WhatsApp / Email</span>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Replies</span>
                        <span className="text-lg sm:text-xl font-bold text-amber-400">{data.businessOutputs.repliesReceived}</span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">Inbound conversations</span>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Opportunities</span>
                        <span className="text-lg sm:text-xl font-bold text-purple-400">{data.businessOutputs.opportunitiesCreated}</span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">Pipeline stage</span>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Payments</span>
                        <span className="text-lg sm:text-xl font-bold text-zinc-300">₹{(data.businessOutputs.paymentsCollectedCents / 100).toFixed(0)}</span>
                        <span className="text-[10px] text-zinc-500 block mt-0.5">Razorpay Links</span>
                      </div>
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                        <span className="text-[10px] uppercase font-semibold text-emerald-400 block">Actual Revenue</span>
                        <span className="text-lg sm:text-xl font-bold text-emerald-300">₹{(data.businessOutputs.actualRevenueCents / 100).toFixed(0)}</span>
                        <span className="text-[10px] text-emerald-400/80 block mt-0.5">Realized INR</span>
                      </div>
                    </div>
                  </div>

                  {/* Split View: Specialists & Latest Timeline */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Active Specialist Cards */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Users size={14} className="text-cyan-400" />
                        <span>Active Workforce Participants</span>
                      </h3>
                      <div className="space-y-2">
                        {data.agents.map((agent) => (
                          <div
                            key={agent.key}
                            onClick={() => setSelectedAgent(agent)}
                            className="group flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 cursor-pointer transition"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 font-bold text-xs text-cyan-400">
                                {agent.name.slice(0, 2)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-zinc-100">{agent.name}</span>
                                  <span className="text-[11px] text-zinc-400">{agent.role}</span>
                                </div>
                                <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{agent.currentAction}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-zinc-500">{agent.officeLocation}</span>
                              <span className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition">Inspect →</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Compact Recent Events */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                          <Activity size={14} className="text-indigo-400" />
                          <span>Recent Execution Stream</span>
                        </h3>
                        <button
                          onClick={() => setActiveTab("timeline")}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          View Full Timeline ({data.timeline.length})
                        </button>
                      </div>
                      <div className="space-y-2">
                        {data.timeline.slice(-4).reverse().map((ev) => (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className="flex items-start justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 cursor-pointer transition text-xs"
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="mt-1 h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-200">{ev.agentName}</span>
                                  <span className="text-zinc-500 font-mono text-[11px]">
                                    {new Date(ev.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className="text-zinc-400 text-[11px] mt-0.5">{ev.action}</p>
                                {ev.resultSnippet && (
                                  <p className="text-emerald-400/90 text-[11px] font-mono mt-0.5">✓ {ev.resultSnippet}</p>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                              {ev.durationMs ? `${ev.durationMs}ms` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: LIVE TIMELINE */}
              {activeTab === "timeline" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-zinc-400">
                      Real-time chronological telemetry event stream. Click any event to inspect raw correlation evidence.
                    </p>
                    <span className="text-xs text-cyan-400 font-mono">{data.timeline.length} events recorded</span>
                  </div>

                  <div className="space-y-2">
                    {data.timeline.slice().reverse().map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 cursor-pointer transition gap-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold">
                            {ev.agentName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono text-zinc-500 text-[11px]">
                                {new Date(ev.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="font-bold text-zinc-200">{ev.agentName}</span>
                              <span className="text-zinc-600">•</span>
                              <span className="text-zinc-300 font-medium">{ev.action}</span>
                            </div>
                            {ev.resultSnippet && (
                              <p className="text-emerald-400 text-xs font-mono mt-0.5">✓ {ev.resultSnippet}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
                          <span className="font-mono text-[11px] text-zinc-500">{ev.correlationId}</span>
                          {ev.durationMs != null && (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                              {ev.durationMs}ms
                            </span>
                          )}
                          <span className="text-cyan-400 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition">
                            Evidence →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: AGENTS & MEMORY */}
              {activeTab === "agents" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.agents.map((agent) => (
                    <div
                      key={agent.key}
                      onClick={() => setSelectedAgent(agent)}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-cyan-500/40 cursor-pointer transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 font-bold text-cyan-400">
                            {agent.name.slice(0, 2)}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-zinc-100">{agent.name}</h4>
                            <span className="text-xs text-zinc-400 block">{agent.role}</span>
                          </div>
                        </div>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700">
                          {agent.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 text-zinc-300">
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase">Current Task</span>
                          <p className="line-clamp-2">{agent.currentAction}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase">Office Workstation</span>
                          <p className="font-mono text-cyan-400 text-[11px]">{agent.officeLocation}</p>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px] uppercase">Tools Allowed</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {agent.toolsAllowed.map((t) => (
                              <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button className="w-full text-center text-xs text-cyan-400 font-medium pt-2 border-t border-zinc-800/60 hover:underline">
                        Open Agent Inspector & Memory →
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: TOOLS & MCP ACTIVITY */}
              {activeTab === "tools" && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Active connected MCP tools and system connectors with safe execution summaries.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.toolActivity.map((tool) => (
                      <div key={tool.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-zinc-500 block">{tool.provider}</span>
                            <h4 className="text-xs sm:text-sm font-mono font-bold text-zinc-100">{tool.toolName}</h4>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            tool.status === "SUCCESS" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400"
                          }`}>
                            {tool.status}
                          </span>
                        </div>
                        <div className="rounded-lg bg-black/40 border border-zinc-800/80 p-2.5 font-mono text-xs text-emerald-400">
                          ✓ {tool.resultSummary}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                          <span>Duration: {tool.durationMs}ms</span>
                          <span>Retries: {tool.retryCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: ARTIFACTS */}
              {activeTab === "artifacts" && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Verified outputs and deliverables produced during mission execution.
                  </p>
                  {data.artifacts.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No artifacts recorded yet. Outputs will appear here once synthesized.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.artifacts.map((art) => (
                        <div key={art.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-cyan-400" />
                              <span className="font-semibold text-xs text-zinc-100">{art.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">{art.kind}</span>
                          </div>
                          <p className="text-zinc-400 text-xs font-mono line-clamp-1">{art.storageRef}</p>
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                            <span>By: {art.creator} (v{art.version})</span>
                            <span className="text-cyan-400 hover:underline cursor-pointer">Open Deliverable →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: COMPLETION CONTRACT */}
              {activeTab === "contract" && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Measurable Objective</span>
                        <h3 className="text-sm sm:text-base font-semibold text-zinc-100">{data.completionContract.goalTitle}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">Contract Status:</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                          data.completionContract.overallSatisfied
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        }`}>
                          {data.completionContract.overallSatisfied ? "Contract Satisfied" : "Pending Requirements"}
                        </span>
                      </div>
                    </div>

                    {data.completionContract.blockerReason && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle size={15} />
                        <span>{data.completionContract.blockerReason}</span>
                      </div>
                    )}

                    {/* Criteria Checklist */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Required Acceptance Criteria Checklist
                      </h4>
                      <div className="space-y-2">
                        {data.completionContract.criteria.map((crit) => (
                          <div
                            key={crit.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-black/40 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              {crit.isSatisfied ? (
                                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                              ) : (
                                <div className="h-4 w-4 rounded-full border border-zinc-600 shrink-0" />
                              )}
                              <span className={crit.isSatisfied ? "text-zinc-200" : "text-zinc-400"}>
                                {crit.description}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-zinc-400">
                              <span className={crit.isSatisfied ? "text-emerald-400 font-bold" : "text-zinc-300"}>
                                {crit.current}
                              </span>{" "}
                              / {crit.target} {crit.unit}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ========================================================================= */}
        {/* MODAL SUB-DRAWER: EVENT EVIDENCE DETAILS                                  */}
        {/* ========================================================================= */}
        {selectedEvent && (
          <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-96 border-l border-zinc-800 bg-[#0c0e14] p-5 shadow-2xl flex flex-col justify-between animate-slideLeft">
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Terminal size={16} className="text-cyan-400" />
                  <span>Telemetry Evidence</span>
                </h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded p-1 text-zinc-400 hover:text-zinc-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="text-xs space-y-2">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Correlation ID</span>
                  <span className="font-mono text-zinc-300">{selectedEvent.correlationId}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Agent & Action</span>
                  <span className="text-zinc-200 font-medium">{selectedEvent.agentName} — {selectedEvent.action}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Timestamp</span>
                  <span className="font-mono text-zinc-400">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                </div>
                {selectedEvent.durationMs != null && (
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase">Duration</span>
                    <span className="font-mono text-zinc-400">{selectedEvent.durationMs}ms</span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Sanitized Execution Payload</span>
                  <pre className="mt-1 max-h-60 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-cyan-300 border border-zinc-800">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedEvent(null)}
              className="mt-4 w-full rounded-lg bg-zinc-800 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Close Evidence
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL SUB-DRAWER: AGENT INSPECTOR                                         */}
        {/* ========================================================================= */}
        {selectedAgent && (
          <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-96 border-l border-zinc-800 bg-[#0c0e14] p-5 shadow-2xl flex flex-col justify-between animate-slideLeft">
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Bot size={18} className="text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">{selectedAgent.name} Inspector</h3>
                    <span className="text-[11px] text-zinc-400">{selectedAgent.role}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="rounded p-1 text-zinc-400 hover:text-zinc-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="text-xs space-y-3">
                <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800 space-y-1">
                  <span className="text-zinc-500 block text-[10px] uppercase">Workstation Location</span>
                  <p className="font-mono text-cyan-400 font-bold">{selectedAgent.officeLocation}</p>
                </div>

                <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800 space-y-1">
                  <span className="text-zinc-500 block text-[10px] uppercase">Current Operational Step</span>
                  <p className="text-zinc-200">{selectedAgent.currentAction}</p>
                </div>

                <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800 space-y-1">
                  <span className="text-zinc-500 block text-[10px] uppercase">Next Scheduled Action</span>
                  <p className="text-zinc-300">{selectedAgent.nextAction}</p>
                </div>

                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase mb-1.5 flex items-center gap-1">
                    <BrainCircuit size={13} className="text-indigo-400" />
                    <span>Active Agent Memory Context</span>
                  </span>
                  <div className="space-y-2">
                    {selectedAgent.memoryItems.map((mem) => (
                      <div key={mem.id} className="rounded-lg bg-black/50 border border-zinc-800 p-2.5 space-y-1">
                        <p className="text-zinc-200 text-[11px]">{mem.content}</p>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/40">
                          <span>Src: {mem.source}</span>
                          <span className="text-emerald-400">Conf: {(mem.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase mb-1">Tools Allowed</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedAgent.toolsAllowed.map((t) => (
                      <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedAgent(null)}
              className="mt-4 w-full rounded-lg bg-zinc-800 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Close Inspector
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
