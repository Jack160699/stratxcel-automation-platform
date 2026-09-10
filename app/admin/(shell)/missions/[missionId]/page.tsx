"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import type { MissionControlPayload } from "@/lib/missions/mission-control-service";
import {
  Zap,
  ArrowLeft,
  RefreshCw,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Search,
  Send,
  Building,
  HardDrive,
  Info,
  TrendingUp,
} from "lucide-react";

export default function MissionDetailPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const unwrappedParams = use(params);
  const missionId = unwrappedParams.missionId;
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [data, setData] = useState<MissionControlPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError(null);
    try {
      const url = tenantId
        ? `/api/platform/missions/${missionId}/control?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/platform/missions/${missionId}/control`;
      const res = await platformFetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Failed to load mission (HTTP ${res.status})`);
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load mission details");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [missionId, tenantId]);

  useEffect(() => {
    loadData();
    // Live polling every 6 seconds when document is visible
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadData(true);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6 pb-20 w-full max-w-full">
        <div className="flex items-center gap-2 text-xs text-sx-text-subtle">
          <Link href="/admin/missions" className="inline-flex items-center gap-1 hover:text-sx-text">
            <ArrowLeft size={13} />
            <span>Missions</span>
          </Link>
        </div>
        <div className="h-28 rounded-2xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-44 rounded-2xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
          <div className="h-44 rounded-2xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
          <div className="h-44 rounded-2xl border border-sx-border/60 bg-sx-surface-1/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-6 pb-20 w-full max-w-full">
        <div className="flex items-center gap-2 text-xs text-sx-text-subtle">
          <Link href="/admin/missions" className="inline-flex items-center gap-1 hover:text-sx-text">
            <ArrowLeft size={13} />
            <span>Back to Missions</span>
          </Link>
        </div>
        <ErrorState message={error} onRetry={() => loadData()} />
      </div>
    );
  }

  if (!data) {
    return (
      <AdminEmptyState
        icon={<Zap size={24} className="text-sx-accent" />}
        title="Mission Not Found"
        description="The requested mission could not be located in the autonomous operating register."
        action={
          <Link
            href="/admin/missions"
            className="inline-flex items-center gap-1.5 rounded-xl bg-sx-accent px-4 py-2 text-xs font-semibold text-sx-accent-on"
          >
            <ArrowLeft size={14} />
            <span>Return to Missions</span>
          </Link>
        }
      />
    );
  }

  const {
    header,
    founderStatus,
    founderProgress,
    founderRequirements,
    currentAction,
    timeline,
    agents,
    toolActivity,
    artifacts,
    businessOutputs,
    completionContract,
    technicalEvidence,
  } = data;

  const isNeedsYou = founderStatus.tone === "needs_you" || founderStatus.tone === "failed";
  const isCompleted = founderStatus.tone === "completed";

  const badgeClass =
    founderStatus.tone === "completed"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : isNeedsYou
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : founderStatus.tone === "repairing"
      ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
      : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";

  return (
    <div className="flex flex-col gap-6 pb-24 w-full max-w-full min-w-0">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/missions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sx-text-subtle transition hover:text-sx-text"
        >
          <ArrowLeft size={14} />
          <span>Back to Missions</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] font-mono text-sx-text-subtle">
            Auto-syncing every 6s
          </span>
          <button
            type="button"
            onClick={() => loadData()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text transition hover:border-sx-border hover:bg-sx-surface-1 disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-sx-accent" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 1. MISSION HEADER */}
      <div className="flex flex-col gap-3 rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sx-surface-2 text-sx-accent border border-sx-border/70">
              <Zap size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sx-accent">
                  Strategic Mission
                </span>
                <span className="text-[11px] text-sx-text-subtle">•</span>
                <span className="text-[11px] font-mono text-sx-text-subtle">
                  Started {new Date(header.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h1 className="text-base sm:text-xl font-bold text-sx-text mt-0.5 break-words">
                {header.goalText}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border ${badgeClass}`}
            >
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              <span>{founderStatus.founderLabel}</span>
            </span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-sx-text-muted mt-1">
          {founderStatus.description}
        </p>
      </div>

      {/* 2. CURRENTLY HAPPENING (Part 9) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
            <Clock size={16} className="animate-spin" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block">
              Currently Happening
            </span>
            <p className="text-xs sm:text-sm font-semibold text-sx-text mt-0.5 break-words">
              {currentAction.currentAction}
            </p>
            <p className="text-[11px] text-sx-text-muted mt-0.5">
              Lead specialist: <strong className="text-sx-text">{currentAction.agentName}</strong> ({currentAction.agentRole})
            </p>
          </div>
        </div>
      </div>

      {/* 3. NEEDS YOU / FOUNDER ACTIONS (Part 12) */}
      {founderRequirements.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-rose-400 shrink-0" />
            <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wide">
              Founder Action Required ({founderRequirements.length})
            </h2>
          </div>

          <div className="flex flex-col gap-3 mt-1">
            {founderRequirements.map((req) => (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-sx-surface-1 p-4"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300">
                      {req.severity}
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-sx-text">
                      {req.title}
                    </h3>
                  </div>
                  <p className="text-xs text-sx-text-muted mt-0.5">
                    <strong>What is needed:</strong> {req.whatNeeded}
                  </p>
                  <p className="text-xs text-sx-text-subtle">
                    <strong>Why it is needed:</strong> {req.whyNeeded}
                  </p>
                  <p className="text-xs text-emerald-400/90 mt-0.5">
                    <strong>What happens after:</strong> {req.whatHappensAfter}
                  </p>
                </div>

                {req.actionUrl && (
                  <Link
                    href={req.actionUrl}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-600 transition"
                  >
                    <span>{req.actionLabel || "Resolve Now"}</span>
                    <ExternalLink size={13} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. PROGRESS & CONTRACT & RESULTS SUMMARY GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Progress & Contract Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-indigo-400" />
                <span>Measurable Progress</span>
              </span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                {founderProgress.stepText}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              {completionContract.criteria.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sx-surface-2/50 border border-sx-border/40 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        c.isSatisfied ? "bg-emerald-400" : "bg-sx-text-subtle"
                      }`}
                    />
                    <span className="text-xs text-sx-text truncate">
                      {c.description}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-sx-text-subtle shrink-0">
                    {c.current} / {c.target}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sx-border/40 flex items-center justify-between text-xs text-sx-text-subtle">
            <span>Overall Contract Status:</span>
            <span
              className={`font-semibold ${
                completionContract.overallSatisfied ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {completionContract.overallSatisfied ? "Goal Satisfied" : "Executing Steps"}
            </span>
          </div>
        </div>

        {/* Business Results Card (Part 11) */}
        <div className="flex flex-col justify-between rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle flex items-center gap-1.5">
                <TrendingUp size={14} className="text-emerald-400" />
                <span>Commercial Results</span>
              </span>
              <Link
                href="/admin/leads"
                className="text-[11px] text-sx-accent hover:underline flex items-center gap-1"
              >
                <span>View CRM</span>
                <ExternalLink size={11} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-sx-border/40 bg-sx-surface-2/40 p-3">
                <span className="text-[10px] uppercase font-bold text-sx-text-subtle block">
                  Discovered Leads
                </span>
                <span className="text-lg font-bold text-sx-text block mt-0.5">
                  {businessOutputs.leadsDiscovered}
                </span>
              </div>

              <div className="rounded-xl border border-sx-border/40 bg-sx-surface-2/40 p-3">
                <span className="text-[10px] uppercase font-bold text-sx-text-subtle block">
                  Qualified Leads
                </span>
                <span className="text-lg font-bold text-emerald-400 block mt-0.5">
                  {businessOutputs.leadsQualified}
                </span>
              </div>

              <div className="rounded-xl border border-sx-border/40 bg-sx-surface-2/40 p-3">
                <span className="text-[10px] uppercase font-bold text-sx-text-subtle block">
                  Outreach Sent
                </span>
                <span className="text-lg font-bold text-sx-text block mt-0.5">
                  {businessOutputs.outreachDispatched}
                </span>
              </div>

              <div className="rounded-xl border border-sx-border/40 bg-sx-surface-2/40 p-3">
                <span className="text-[10px] uppercase font-bold text-sx-text-subtle block">
                  Customer Replies
                </span>
                <span className="text-lg font-bold text-indigo-400 block mt-0.5">
                  {businessOutputs.repliesReceived}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sx-border/40 flex items-center justify-between text-xs text-sx-text-subtle">
            <span>Collected Revenue:</span>
            <span className="font-mono font-bold text-emerald-400">
              ₹{(businessOutputs.actualRevenueCents / 100).toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Specialists Team Card (Part 10) */}
        <div className="flex flex-col justify-between rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 shadow-xs">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-sx-text-subtle flex items-center gap-1.5">
              <Users size={14} className="text-cyan-400" />
              <span>Specialist Team ({agents.length})</span>
            </span>

            <div className="flex flex-col gap-2.5 mt-4">
              {agents.map((ag) => (
                <div
                  key={ag.key}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-sx-surface-2/50 border border-sx-border/40 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <strong className="text-sx-text text-xs">{ag.name}</strong>
                      <span className="text-[10px] text-sx-text-subtle">• {ag.role}</span>
                    </div>
                    <p className="text-[11px] text-sx-text-muted truncate mt-0.5">
                      {ag.currentAction}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      ag.status === "ACTIVE"
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "bg-sx-surface-3 text-sx-text-subtle"
                    }`}
                  >
                    {ag.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sx-border/40 text-xs text-sx-text-subtle">
            All specialists operating under Hermes autonomous governance.
          </div>
        </div>
      </div>

      {/* 5. FILES & REAL ARTIFACTS (Parts 15-21) */}
      <div className="flex flex-col gap-4 rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-sx-text flex items-center gap-2">
              <HardDrive size={16} className="text-sx-accent" />
              <span>Mission Deliverables ({artifacts.length})</span>
            </h2>
            <p className="text-xs text-sx-text-muted mt-0.5">
              Verified business files stored in Google Drive under{" "}
              <code className="rounded bg-sx-surface-2 px-1 py-0.5 font-mono text-[11px] text-sx-text">
                StratXcel/Autonomous Company/Missions/
              </code>
            </p>
          </div>
        </div>

        {artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-sx-border/80 bg-sx-surface-2/30 text-center">
            <HardDrive size={24} className="text-sx-text-subtle" />
            <p className="text-xs font-medium text-sx-text-muted mt-2">
              No files attached to this mission yet.
            </p>
            <p className="text-[11px] text-sx-text-subtle mt-1 max-w-md">
              Hermes generates, validates, and uploads deliverables (reports, CSV lead lists, creative media)
              directly to Google Drive as mission phases finish.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {artifacts.map((art) => {
              const kindLower = (art.kind || "").toLowerCase();
              const isSheet = kindLower.includes("csv") || kindLower.includes("sheet") || kindLower.includes("table");
              const isImage = kindLower.includes("image") || kindLower.includes("png") || kindLower.includes("jpg");
              const isDoc = kindLower.includes("doc") || kindLower.includes("report") || kindLower.includes("pdf");

              const icon = isSheet ? (
                <FileSpreadsheet size={20} className="text-emerald-400" />
              ) : isImage ? (
                <FileImage size={20} className="text-indigo-400" />
              ) : isDoc ? (
                <FileText size={20} className="text-cyan-400" />
              ) : (
                <FileCode size={20} className="text-amber-400" />
              );

              const isMissing = art.metadata?.status === "FILE_MISSING";

              return (
                <div
                  key={art.id}
                  className="flex flex-col justify-between rounded-xl border border-sx-border/70 bg-sx-surface-2/50 p-4 transition hover:border-sx-border-strong hover:bg-sx-surface-2 gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sx-surface-1 border border-sx-border/60">
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-sx-text truncate" title={art.label}>
                        {art.label}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase font-semibold text-sx-text-subtle">
                          {art.kind}
                        </span>
                        <span className="text-[10px] text-sx-text-subtle">•</span>
                        <span className="text-[10px] font-mono text-sx-text-subtle">
                          v{art.version}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-sx-border/40 text-xs">
                    <span
                      className={`text-[11px] font-medium ${
                        isMissing ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {isMissing ? "Hermes Repairing" : "Verified in Drive"}
                    </span>

                    <a
                      href={`/api/platform/missions/artifacts/${art.id}/open`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-sx-surface-1 border border-sx-border/80 px-3 py-1 text-xs font-semibold text-sx-text hover:bg-sx-accent hover:text-sx-accent-on transition shadow-xs"
                    >
                      <span>Open</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. ACTIVITY / EXECUTION HISTORY (Part 6) */}
      <div className="flex flex-col gap-4 rounded-2xl border border-sx-border/80 bg-sx-surface-1 p-5 sm:p-6 shadow-xs">
        <h2 className="text-sm sm:text-base font-bold text-sx-text flex items-center gap-2">
          <Clock size={16} className="text-sx-accent" />
          <span>Execution Activity</span>
        </h2>

        <div className="flex flex-col gap-3">
          {timeline.slice(-8).reverse().map((ev) => (
            <div
              key={ev.id}
              className="flex items-start justify-between gap-3 p-3 rounded-xl bg-sx-surface-2/40 border border-sx-border/40 text-xs"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sx-surface-1 text-sx-accent font-bold text-[10px] border border-sx-border/60">
                  {ev.agentName[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sx-text font-semibold">{ev.agentName}</strong>
                    <span className="text-[11px] text-sx-text-subtle">•</span>
                    <span className="text-[11px] text-sx-text-muted">{ev.action}</span>
                  </div>
                  {ev.resultSnippet && (
                    <p className="text-[11px] text-sx-text-subtle mt-0.5 truncate">
                      {ev.resultSnippet}
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-[10px] font-mono text-sx-text-subtle block">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`text-[9px] uppercase font-bold tracking-wider ${
                    ev.status === "SUCCESS"
                      ? "text-emerald-400"
                      : ev.status === "FAILED"
                      ? "text-rose-400"
                      : "text-amber-400"
                  }`}
                >
                  {ev.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7. DETAILS / TECHNICAL EVIDENCE (Part 25 - Collapsible) */}
      <div className="flex flex-col rounded-2xl border border-sx-border/80 bg-sx-surface-1 overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowEvidence(!showEvidence)}
          className="flex items-center justify-between w-full p-4 sm:p-5 text-left transition hover:bg-sx-surface-2/40"
        >
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="text-sx-text-subtle" />
            <div>
              <span className="text-xs sm:text-sm font-bold text-sx-text block">
                Technical Evidence & Diagnostics
              </span>
              <span className="text-[11px] text-sx-text-subtle">
                Internal state-machine signals, correlation IDs, MCP tool traces, and worker heartbeats
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-sx-text-subtle">
            <span>{showEvidence ? "Hide" : "Show"}</span>
            {showEvidence ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {showEvidence && (
          <div className="flex flex-col gap-5 p-5 border-t border-sx-border/60 bg-sx-surface-2/20 text-xs font-mono">
            {/* System Identifiers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-sx-surface-1 border border-sx-border/60">
                <span className="text-[10px] uppercase text-sx-text-subtle block">Mission UUID</span>
                <span className="text-xs text-sx-text truncate block mt-0.5">{technicalEvidence.missionId}</span>
              </div>
              <div className="p-3 rounded-xl bg-sx-surface-1 border border-sx-border/60">
                <span className="text-[10px] uppercase text-sx-text-subtle block">Service Key</span>
                <span className="text-xs text-sx-text truncate block mt-0.5">{technicalEvidence.serviceKey}</span>
              </div>
              <div className="p-3 rounded-xl bg-sx-surface-1 border border-sx-border/60">
                <span className="text-[10px] uppercase text-sx-text-subtle block">Raw DB State</span>
                <span className="text-xs text-sx-text truncate block mt-0.5">{technicalEvidence.rawDbState}</span>
              </div>
              <div className="p-3 rounded-xl bg-sx-surface-1 border border-sx-border/60">
                <span className="text-[10px] uppercase text-sx-text-subtle block">Correlation IDs</span>
                <span className="text-xs text-sx-text truncate block mt-0.5">
                  {technicalEvidence.correlationIds.length} tracked
                </span>
              </div>
            </div>

            {/* MCP & Tool Activities */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-sx-text uppercase tracking-wider">
                MCP / Tool Executions ({toolActivity.length})
              </span>
              <div className="overflow-x-auto max-h-60 rounded-xl border border-sx-border/60 bg-sx-surface-1">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-sx-border/60 bg-sx-surface-2/60 text-[10px] text-sx-text-subtle uppercase">
                    <tr>
                      <th className="p-2.5">Tool Name</th>
                      <th className="p-2.5">Provider</th>
                      <th className="p-2.5">Duration</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sx-border/40 text-[11px]">
                    {toolActivity.map((t) => (
                      <tr key={t.id}>
                        <td className="p-2.5 font-bold text-sx-text">{t.toolName}</td>
                        <td className="p-2.5 text-sx-text-subtle">{t.provider}</td>
                        <td className="p-2.5 text-sx-text-subtle">{t.durationMs}ms</td>
                        <td className="p-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                              t.status === "SUCCESS"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-sx-text-muted truncate max-w-xs">{t.resultSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Worker Internals */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-sx-text uppercase tracking-wider">
                Active Worker Heartbeats
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {technicalEvidence.workerInternals.map((w, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-sx-surface-1 border border-sx-border/50 text-xs">
                    <span className="text-[10px] text-sx-text-subtle block">{w.workerType}</span>
                    <span className="text-xs font-bold text-emerald-400 block mt-0.5">{w.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
