"use client";

import type { LiveWorker } from "./office-types";
import { Clock, Activity, Zap } from "lucide-react";

interface AgentHoverCardProps {
  worker: LiveWorker | null;
  position: { x: number; y: number } | null;
}

export function AgentHoverCard({ worker, position }: AgentHoverCardProps) {
  if (!worker || !position) return null;

  const isWorking = worker.state === "WORKING";
  const mission = worker.currentMission;

  const isTopHeavy = position.y < 240;
  const leftX =
    typeof window !== "undefined"
      ? Math.max(140, Math.min(window.innerWidth - 140, position.x))
      : position.x;

  return (
    <div
      className={`pointer-events-none fixed z-50 w-64 transform -translate-x-1/2 rounded-2xl border border-white/20 bg-slate-950/90 p-3.5 backdrop-blur-2xl shadow-2xl text-xs transition-opacity duration-200 ${
        isTopHeavy ? "translate-y-4" : "-translate-y-full mb-3"
      }`}
      style={{
        left: `${leftX}px`,
        top: `${position.y}px`,
      }}
    >
      {/* Header: Agent Identity & Status */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wide text-xs uppercase">
            <span>{worker.name}</span>
            {worker.key === "hermes" && <Zap className="h-3 w-3 text-cyan-400 fill-cyan-400" />}
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {worker.role}
          </span>
        </div>

        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `${worker.accentColor}20`,
            color: worker.accentColor,
            border: `1px solid ${worker.accentColor}40`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: worker.accentColor }}
          />
          {worker.state}
        </span>
      </div>

      {/* Body: Compact AR Telemetry */}
      <div className="mt-2.5 space-y-2 text-[11px]">
        {/* Active Mission Details (if present) */}
        {mission ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="font-bold text-slate-300 truncate max-w-[140px]">
                {mission.goal}
              </span>
              {mission.progressPercent !== undefined && (
                <span className="font-bold text-emerald-400">{mission.progressPercent}%</span>
              )}
            </div>

            {mission.currentStep && (
              <div className="flex items-center gap-1 text-[9px] text-slate-400 truncate">
                <Clock className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                <span className="truncate">{mission.currentStep}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span>Current Status</span>
            <span className="font-medium text-slate-200">{worker.statusLabel}</span>
          </div>
        )}

        {/* Live Pulse Timestamp */}
        {worker.lastHeartbeatAt && (
          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-white/5">
            <span className="flex items-center gap-1">
              <Activity className="h-2.5 w-2.5 text-emerald-400" />
              Live Pulse
            </span>
            <span className="font-mono text-emerald-300">
              {worker.heartbeatAgeMs !== null
                ? `${Math.max(1, Math.round(worker.heartbeatAgeMs / 1000))}s ago`
                : "Active"}
            </span>
          </div>
        )}
      </div>

      {/* Triangular AR Pip Pointer */}
      <div
        className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-white/20 bg-slate-950 ${
          isTopHeavy ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-r border-b"
        }`}
      />
    </div>
  );
}
