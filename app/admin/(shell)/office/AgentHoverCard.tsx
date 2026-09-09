"use client";

import type { LiveWorker } from "./office-types";
import { Eye, Clock, Wrench, ShieldCheck, Activity } from "lucide-react";

interface AgentHoverCardProps {
  worker: LiveWorker | null;
  position: { x: number; y: number } | null;
}

export function AgentHoverCard({ worker, position }: AgentHoverCardProps) {
  if (!worker || !position) return null;

  const isWorking = worker.state === "WORKING";
  const mission = worker.currentMission;

  const isTopHeavy = position.y < 280;
  const leftX = typeof window !== "undefined"
    ? Math.max(160, Math.min(window.innerWidth - 160, position.x))
    : position.x;

  return (
    <div
      className={`pointer-events-none fixed z-50 w-72 transform -translate-x-1/2 rounded-2xl border border-white/20 bg-slate-900/95 p-4 backdrop-blur-2xl shadow-2xl text-xs transition-opacity duration-200 ${
        isTopHeavy ? "translate-y-4" : "-translate-y-full mb-3"
      }`}
      style={{
        left: `${leftX}px`,
        top: `${position.y}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-slate-200">
            <Eye className="h-3.5 w-3.5 text-indigo-400" />
          </span>
          <div>
            <h4 className="font-semibold text-white tracking-tight">{worker.name}</h4>
            <p className="text-[10px] text-slate-400">{worker.role}</p>
          </div>
        </div>

        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${worker.accentColor}25`,
            color: worker.accentColor,
            border: `1px solid ${worker.accentColor}50`,
          }}
        >
          {worker.state}
        </span>
      </div>

      {/* Body: Real Telemetry Details */}
      <div className="mt-3 space-y-2 text-[11px]">
        {/* Department */}
        <div className="flex justify-between items-center text-slate-400">
          <span>Department</span>
          <span className="font-medium text-slate-200">{worker.departmentLabel}</span>
        </div>

        {/* Backing System */}
        <div className="flex justify-between items-center text-slate-400">
          <span>Backing Worker</span>
          <span className="font-mono text-[10px] text-slate-300">
            {worker.workerType || "Agent Core"}
          </span>
        </div>

        {/* Heartbeat Status */}
        {worker.lastHeartbeatAt && (
          <div className="flex justify-between items-center text-slate-400">
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-emerald-400" />
              Pulse
            </span>
            <span className="font-mono text-[10px] text-emerald-300">
              {worker.heartbeatAgeMs !== null
                ? `${Math.max(1, Math.round(worker.heartbeatAgeMs / 1000))}s ago`
                : "Active"}
            </span>
          </div>
        )}

        {/* Active Mission Details (if real mission is present) */}
        {mission ? (
          <div className="mt-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5 space-y-1.5">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">
                Current Mission
              </span>
              {mission.progressPercent !== undefined && (
                <span className="font-mono text-[10px] font-bold text-white">
                  {mission.progressPercent}%
                </span>
              )}
            </div>
            <p className="font-medium text-slate-100 line-clamp-2 leading-relaxed">
              {mission.goal}
            </p>

            {mission.currentStep && (
              <div className="pt-1 flex items-center gap-1.5 text-[10px] text-slate-400 border-t border-white/5">
                <Clock className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="truncate">{mission.currentStep}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.03] p-2 text-center text-slate-400 text-[10px] italic">
            Standing by — no active mission assigned
          </div>
        )}

        {/* Allowed Tools Hint */}
        {worker.allowedTools.length > 0 && (
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <Wrench className="h-3 w-3 text-slate-500" />
              Governed Tools
            </span>
            <span className="font-mono font-medium text-slate-300">
              {worker.allowedTools.length} tools
            </span>
          </div>
        )}
      </div>

      {/* Floating Arrow Tooltip Pip */}
      <div
        className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-white/20 bg-slate-900 ${
          isTopHeavy ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-r border-b"
        }`}
      />
    </div>
  );
}
