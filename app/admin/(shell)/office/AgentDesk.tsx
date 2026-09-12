"use client";

import type { LiveWorker } from "./office-types";
import { Eye, CheckCircle2, AlertCircle, Clock, Zap, Radio } from "lucide-react";

interface AgentDeskProps {
  worker: LiveWorker;
  isWorkerPresent?: boolean;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (worker: LiveWorker) => void;
  onHover: (worker: LiveWorker | null, event?: { clientX: number; clientY: number }) => void;
}

export function AgentDesk({
  worker,
  isWorkerPresent = true,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: AgentDeskProps) {
  const isHermes = worker.key === "hermes";
  const isWorking =
    (worker.state === "WORKING" ||
      worker.state === "SEARCHING" ||
      worker.state === "ANALYZING" ||
      worker.state === "PLANNING" ||
      worker.state === "GENERATING" ||
      worker.state === "DELEGATING" ||
      worker.state === "MEETING" ||
      worker.state === "HANDOFF") &&
    isWorkerPresent;

  const isError = worker.state === "ERROR";
  const isBlocked = worker.state === "BLOCKED";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(worker);
    }
  }

  // State dot colors
  const statusColor = isError
    ? "#f43f5e"
    : isBlocked
    ? "#f59e0b"
    : isWorking
    ? worker.accentColor
    : "#94a3b8";

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
      className={`group relative flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-300 focus-visible:outline-none ${
        isSelected
          ? "scale-105"
          : isHovered
          ? "scale-[1.03]"
          : "hover:scale-[1.01]"
      }`}
      style={{
        width: isHermes ? "100px" : "84px",
        height: isHermes ? "70px" : "60px",
      }}
    >
      {/* 1. Subtle Ambient Floor Radiance underneath physical desk */}
      <div
        className="pointer-events-none absolute -bottom-1 h-10 w-24 rounded-full opacity-30 blur-lg transition-all duration-500 group-hover:opacity-70"
        style={{
          backgroundColor: statusColor,
        }}
      />

      {/* 2. Workstation Interactive Boundary (Transparent glass ring when hovered/selected) */}
      <div
        className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
          isSelected
            ? "border border-cyan-400 bg-cyan-500/[0.12] shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            : isHovered
            ? "border border-white/30 bg-white/[0.06] shadow-lg"
            : "border border-transparent group-hover:border-white/20 group-hover:bg-white/[0.04]"
        }`}
      />

      {/* 3. Floating Agent Presence Tag */}
      <div
        className={`relative z-20 flex items-center gap-1.5 rounded-full border px-2 py-0.5 shadow-xl backdrop-blur-xl transition-all duration-200 ${
          isSelected
            ? "border-cyan-400/80 bg-slate-950/95 shadow-cyan-500/30 scale-105"
            : isHovered
            ? "border-white/40 bg-slate-950/90 scale-100"
            : "border-white/15 bg-slate-950/75 opacity-85 group-hover:opacity-100"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isWorking ? "animate-ping" : ""
          }`}
          style={{ backgroundColor: statusColor }}
        />
        <span className="font-mono text-[9px] font-bold text-white tracking-wide">
          {worker.name}
        </span>
        <span className="hidden sm:inline font-mono text-[8px] text-slate-400 capitalize">
          · {worker.state.toLowerCase()}
        </span>
      </div>

      {/* 4. Real Mission Activity Snippet (Shows on hover or when actively working) */}
      {(isHovered || isSelected || isWorking) && worker.currentMission?.currentStep && (
        <div className="absolute -bottom-5 z-30 flex items-center gap-1 rounded-md border border-white/10 bg-slate-950/90 px-2 py-0.5 text-[7px] font-mono text-cyan-300 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap">
          <Zap className="h-2 w-2 text-cyan-400 shrink-0" />
          <span className="truncate max-w-[90px]">
            {worker.currentMission.currentStep.replace(/_/g, " ")}
          </span>
        </div>
      )}
    </div>
  );
}
