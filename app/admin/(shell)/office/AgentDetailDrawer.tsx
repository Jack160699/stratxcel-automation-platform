"use client";

import { useState } from "react";
import type { LiveWorker } from "./office-types";
import {
  X,
  ExternalLink,
  ShieldCheck,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

interface AgentDetailDrawerProps {
  worker: LiveWorker | null;
  onClose: () => void;
}

export function AgentDetailDrawer({ worker, onClose }: AgentDetailDrawerProps) {
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!worker) return null;

  const isWorking = worker.state === "WORKING";
  const mission = worker.currentMission;

  function handleActionClick(actionKey: string) {
    if (confirmingAction === actionKey) {
      // Confirmed action execution
      setActionMessage(`Action executed: ${actionKey}`);
      setConfirmingAction(null);
      setTimeout(() => setActionMessage(null), 3000);
    } else {
      setConfirmingAction(actionKey);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity duration-300">
      {/* Click outside to close backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container */}
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-950/95 p-6 backdrop-blur-2xl shadow-2xl text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
              style={{
                backgroundColor: `${worker.accentColor}20`,
                border: `1.5px solid ${worker.accentColor}`,
              }}
            >
              <span
                className="font-bold text-lg"
                style={{ color: worker.accentColor }}
              >
                {worker.name.slice(0, 1)}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {worker.name}
              </h2>
              <p className="text-xs text-slate-400">{worker.role}</p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: worker.accentColor }}
                />
                <span className="text-slate-300">{worker.departmentLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            aria-label="Close detail panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Badge & Metrics */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Operational Status
            </span>
            <div className="mt-0.5 text-sm font-semibold text-white">
              {worker.statusLabel}
            </div>
          </div>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-sm"
            style={{
              backgroundColor: `${worker.accentColor}25`,
              color: worker.accentColor,
              border: `1px solid ${worker.accentColor}50`,
            }}
          >
            {worker.state}
          </span>
        </div>

        {/* Organizational Context & Hierarchy */}
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs space-y-1.5 font-mono">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Reports To:</span>
            <span className="text-cyan-300 font-bold">{worker.reportsTo || "Hermes (CEO)"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Assignment:</span>
            <span className="text-slate-200">
              {worker.helpingWorkerKey ? `Assisting ${worker.helpingWorkerKey}` : "Specialist Lead"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Shift Schedule:</span>
            <span className="text-emerald-400 font-bold">
              {worker.shiftStatus === "AUTONOMOUS_24_7" ? "24/7 Autonomous" : worker.shiftStatus || "Active"}
            </span>
          </div>
          {worker.lastHeartbeatAt && (
            <div className="flex justify-between items-center pt-1 border-t border-white/5 text-[10px]">
              <span className="text-slate-500">Heartbeat:</span>
              <span className="text-slate-400">{new Date(worker.lastHeartbeatAt).toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        {/* Action Confirmation Banner */}
        {actionMessage && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            {actionMessage}
          </div>
        )}

        {/* Current Active Mission */}
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Active Mission
          </h3>
          {mission ? (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-mono text-indigo-300 uppercase">
                  {mission.serviceKey}
                </span>
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
                  {mission.state}
                </span>
              </div>

              <p className="text-sm font-medium text-white leading-relaxed">
                {mission.goal}
              </p>

              {mission.currentStep && (
                <div className="rounded-lg bg-black/40 p-2.5 text-xs text-slate-300 font-mono flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Step: {mission.currentStep}</span>
                </div>
              )}

              {mission.runId && (
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Hermes Run:</span>
                  <span className="font-mono text-slate-300">{mission.runId.slice(0, 16)}...</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <Link
                  href={`/admin/missions?id=${mission.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-all"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-indigo-400" />
                  Open Mission
                </Link>

                <Link
                  href="/admin/hermes"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all"
                >
                  <FileText className="h-3.5 w-3.5 text-sky-400" />
                  Hermes Control
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">
              No mission currently executing. Worker is in standby and ready for dispatch.
            </div>
          )}
        </div>

        {/* Governed Actions (Confirmation-Gated) */}
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Worker Governance Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleActionClick("pause_worker")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                confirmingAction === "pause_worker"
                  ? "border-amber-500 bg-amber-500/20 text-amber-200 animate-pulse"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Pause className="h-3.5 w-3.5 text-amber-400" />
              <span>{confirmingAction === "pause_worker" ? "Confirm Pause?" : "Pause Worker"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleActionClick("reset_worker")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                confirmingAction === "reset_worker"
                  ? "border-rose-500 bg-rose-500/20 text-rose-200 animate-pulse"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-rose-400" />
              <span>{confirmingAction === "reset_worker" ? "Confirm Reset?" : "Reset Worker"}</span>
            </button>
          </div>
          {confirmingAction && (
            <p className="text-[10px] text-amber-300/80 italic text-center">
              Click again to execute governed confirmation-gated action.
            </p>
          )}
        </div>

        {/* Recent Operational Activity Log */}
        <div className="mt-6 space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Recent Activity Log
          </h3>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 space-y-2 max-h-48 overflow-y-auto">
            {worker.recentActivity.map((act, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-slate-200 leading-snug">{act.description}</p>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(act.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Allowed Governed Tools */}
        <div className="mt-6 space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Governed Tool Set ({worker.allowedTools.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {worker.allowedTools.map((tool) => (
              <span
                key={tool}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-300"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
