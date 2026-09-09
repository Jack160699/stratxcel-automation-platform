"use client";

import type { LiveWorker } from "./office-types";
import { AgentCharacter } from "./AgentCharacter";
import { Eye, CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";

interface AgentDeskProps {
  worker: LiveWorker;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (worker: LiveWorker) => void;
  onHover: (worker: LiveWorker | null, event?: { clientX: number; clientY: number }) => void;
}

export function AgentDesk({
  worker,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: AgentDeskProps) {
  const isHermes = worker.key === "hermes";
  const isWorking = worker.state === "WORKING";
  const isError = worker.state === "ERROR";
  const isBlocked = worker.state === "BLOCKED";
  const isCompleted = worker.state === "COMPLETED";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(worker);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(worker)}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onHover(worker, { clientX: rect.left + rect.width / 2, clientY: rect.top });
      }}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onHover(worker, { clientX: rect.left + rect.width / 2, clientY: rect.top });
      }}
      onBlur={() => onHover(null)}
      aria-label={`${worker.name} (${worker.role}) - Status: ${worker.state}`}
      className={`group relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-400 ${
        isSelected
          ? "scale-105 ring-2 ring-indigo-400/90 bg-indigo-950/40 shadow-2xl"
          : isHovered
          ? "scale-[1.03] bg-white/5 shadow-xl"
          : "hover:scale-[1.02] hover:bg-white/[0.03]"
      }`}
    >
      {/* Dynamic Floor Footprint Glow */}
      <div
        className="absolute -bottom-2 h-14 w-32 rounded-full opacity-35 blur-xl transition-all duration-500 group-hover:opacity-60"
        style={{ backgroundColor: worker.bgGlow }}
      />

      {/* Department & Role Header Tag */}
      <div className="mb-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/85 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 shadow-md">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: worker.accentColor }}
        />
        <span className="tracking-wide uppercase">{worker.departmentLabel}</span>
      </div>

      {/* Workstation Unit (2.5D Desk + Monitor + Character) */}
      <div className="relative flex flex-col items-center justify-center">
        {/* The Agent Avatar Character */}
        <div className="relative z-10 -mb-2">
          <AgentCharacter
            name={worker.name}
            department={worker.department}
            state={worker.state}
            accentColor={worker.accentColor}
            secondaryColor={worker.secondaryColor}
            isHermes={isHermes}
          />
        </div>

        {/* Workstation Isometric Surface */}
        <div className="relative z-20 flex flex-col items-center">
          {/* Curved Ultra-wide Monitor Screen */}
          <div
            className="relative flex items-center justify-center rounded-t-lg border border-slate-700 bg-slate-950/90 px-3 py-1 shadow-inner transition-all duration-300"
            style={{
              width: isHermes ? "88px" : "74px",
              height: isHermes ? "28px" : "22px",
              borderColor: isWorking ? worker.accentColor : "#334155",
              boxShadow: isWorking
                ? `0 0 14px ${worker.bgGlow}, inset 0 0 8px ${worker.bgGlow}`
                : "none",
            }}
          >
            {/* Monitor Content Indicator */}
            {isWorking ? (
              <div className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-white animate-ping"></span>
                <span className="text-[9px] font-mono font-bold tracking-tight text-white truncate max-w-[65px]">
                  {worker.currentMission?.currentStep || "RUNNING"}
                </span>
              </div>
            ) : isError ? (
              <AlertCircle className="h-3 w-3 text-rose-500" />
            ) : isBlocked ? (
              <Clock className="h-3 w-3 text-amber-400" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <div className="flex items-center gap-0.5">
                <span className="h-1 w-1 rounded-full bg-slate-600"></span>
                <span className="h-1 w-1 rounded-full bg-slate-600"></span>
                <span className="h-1 w-1 rounded-full bg-slate-600"></span>
              </div>
            )}
          </div>

          {/* Desk Surface (Glass / Carbon Finish) */}
          <div
            className="relative -mt-0.5 rounded-b-xl border border-white/15 bg-gradient-to-b from-slate-800 to-slate-900 shadow-xl transition-all duration-300"
            style={{
              width: isHermes ? "104px" : "86px",
              height: "18px",
            }}
          >
            {/* Illuminated Front Edge Light */}
            <div
              className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full opacity-80"
              style={{ backgroundColor: worker.accentColor }}
            />
          </div>
        </div>
      </div>

      {/* Name and State Pill */}
      <div className="mt-2 flex flex-col items-center">
        <span className="font-semibold text-xs text-white tracking-wide flex items-center gap-1">
          {worker.name}
          {isHermes && <Zap className="h-3 w-3 text-cyan-400 fill-cyan-400" />}
        </span>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: isError
                ? "#ef4444"
                : isBlocked
                ? "#f59e0b"
                : isWorking
                ? "#10b981"
                : isCompleted
                ? "#38bdf8"
                : "#64748b",
            }}
          />
          <span className="font-medium truncate max-w-[90px]">{worker.statusLabel}</span>
        </div>
      </div>

      {/* Hover Peek "Eye" Icon */}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-slate-300 backdrop-blur-sm shadow">
          <Eye className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
