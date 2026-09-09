"use client";

import type { LiveWorker, DepartmentKey } from "./office-types";
import { AgentCharacter } from "./AgentCharacter";
import { Eye, CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";

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
      worker.state === "HANDOFF" ||
      worker.state === "HELPING") &&
    isWorkerPresent;
  const isThinking = worker.state === "THINKING";
  const isError = worker.state === "ERROR";
  const isBlocked = worker.state === "BLOCKED";
  const isCompleted = worker.state === "COMPLETED";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(worker);
    }
  }

  // Render contextual miniature visual graphics on the primary monitor
  const renderMonitorVisuals = (department: DepartmentKey) => {
    if (!isWorkerPresent) {
      // Dim standby display when worker is away from desk
      return (
        <div className="flex h-full w-full flex-col justify-center items-center p-1 text-[6px] font-mono text-slate-500 opacity-60">
          <span className="truncate">STANDBY</span>
        </div>
      );
    }

    switch (department) {
      case "seo":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 text-[7px] font-mono">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="font-bold">SERP #1</span>
              <span>+34%</span>
            </div>
            <svg viewBox="0 0 40 12" className="h-2.5 w-full stroke-emerald-400 fill-none" strokeWidth="1.2">
              <path d="M0 10 Q10 9, 18 5 T30 4 T40 1" />
            </svg>
            <div className="flex gap-0.5">
              <div className="h-0.5 w-3 rounded-full bg-emerald-500/60" />
              <div className="h-0.5 w-5 rounded-full bg-emerald-500/40" />
              <div className="h-0.5 w-2 rounded-full bg-emerald-500/30" />
            </div>
          </div>
        );

      case "content":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1">
            <div className="h-1 w-8 rounded-sm bg-amber-400/90" />
            <div className="space-y-0.5">
              <div className="h-0.5 w-full rounded bg-white/40" />
              <div className="h-0.5 w-4/5 rounded bg-white/30" />
              <div className="h-0.5 w-3/4 rounded bg-white/20" />
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
              <div className="h-0.5 w-6 rounded bg-amber-300/40" />
            </div>
          </div>
        );

      case "research":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1">
            <div className="flex justify-between items-center text-[7px] text-amber-300 font-mono">
              <span>INTEL</span>
              <span>98%</span>
            </div>
            <div className="flex items-end justify-between gap-0.5 h-3 px-1">
              <div className="w-1.5 h-2 rounded-t-sm bg-yellow-500/70" />
              <div className="w-1.5 h-3 rounded-t-sm bg-yellow-400" />
              <div className="w-1.5 h-1.5 rounded-t-sm bg-yellow-500/50" />
              <div className="w-1.5 h-2.5 rounded-t-sm bg-yellow-400/90" />
            </div>
            <div className="h-0.5 w-full rounded bg-yellow-400/30" />
          </div>
        );

      case "website":
      case "engineering":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono text-[6px]">
            <div className="flex items-center gap-1">
              <span className="text-sky-400">const</span>
              <span className="text-white">site</span>
            </div>
            <div className="pl-1 text-slate-400">
              <span className="text-indigo-300">&lt;Page</span>
              <span className="text-emerald-400"> live</span>
              <span className="text-indigo-300">/&gt;</span>
            </div>
            <div className="flex items-center justify-between text-[5px] text-sky-400/80 border-t border-white/10 pt-0.5">
              <span>deploy: vercel</span>
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-ping" />
            </div>
          </div>
        );

      case "creative":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1">
            <div className="flex items-center justify-between">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              <div className="flex gap-0.5">
                <div className="h-1 w-1 rounded-sm bg-pink-400" />
                <div className="h-1 w-1 rounded-sm bg-indigo-400" />
              </div>
            </div>
            <div className="h-3 w-full rounded border border-purple-400/60 bg-purple-950/40 p-0.5 flex items-center justify-center">
              <div className="h-1.5 w-4 rounded-sm bg-gradient-to-r from-purple-400 to-pink-400 opacity-80" />
            </div>
            <div className="h-0.5 w-3/4 rounded bg-purple-400/30" />
          </div>
        );

      case "operations":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono text-[6px]">
            <div className="flex justify-between items-center text-cyan-300 font-bold">
              <span>EC2 FLEET</span>
              <span className="text-[5px]">OK</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1">
                <div className="h-0.5 flex-1 rounded bg-cyan-500/70" />
                <span className="text-[5px] text-cyan-200">99.8%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-0.5 w-3/4 rounded bg-cyan-500/40" />
                <span className="text-[5px] text-slate-400">queue</span>
              </div>
            </div>
            <div className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              <span className="h-1 w-1 rounded-full bg-cyan-400" />
            </div>
          </div>
        );

      case "finance":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono text-[6px]">
            <div className="flex justify-between items-center text-emerald-300 font-bold">
              <span>PRO-FORMA</span>
              <span className="text-[5px] text-emerald-400">ARR</span>
            </div>
            <div className="flex items-end justify-between gap-0.5 h-3 px-1">
              <div className="w-1.5 h-1.5 rounded-t-sm bg-emerald-500/50" />
              <div className="w-1.5 h-2.5 rounded-t-sm bg-emerald-400" />
              <div className="w-1.5 h-3 rounded-t-sm bg-emerald-300" />
              <div className="w-1.5 h-2 rounded-t-sm bg-emerald-500/70" />
            </div>
            <div className="flex justify-between text-[5px] text-slate-400 border-t border-white/10 pt-0.5">
              <span>LEDGER: OK</span>
              <span className="text-emerald-400 font-bold">+18.4%</span>
            </div>
          </div>
        );

      case "people":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono text-[6px]">
            <div className="flex justify-between items-center text-purple-300 font-bold">
              <span>WORKFORCE</span>
              <span className="text-[5px] text-purple-400">ROSTER</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-purple-400" />
                <div className="h-0.5 w-8 rounded bg-purple-300/60" />
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-emerald-400" />
                <div className="h-0.5 w-6 rounded bg-emerald-300/60" />
              </div>
            </div>
            <div className="text-[5px] text-slate-400 border-t border-white/10 pt-0.5">
              <span>27 DEPTS ACTIVE</span>
            </div>
          </div>
        );

      case "marketing":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono text-[6px]">
            <div className="flex justify-between items-center text-amber-300 font-bold">
              <span>CAMPAIGNS</span>
              <span className="text-[5px] text-amber-400">ACTIVE</span>
            </div>
            <div className="h-2.5 w-full rounded bg-amber-950/40 border border-amber-500/30 p-0.5 flex items-center justify-between">
              <span className="text-[5px] text-amber-200">OUTREACH</span>
              <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <div className="flex justify-between text-[5px] text-slate-400">
              <span>REACH: 12.4K</span>
              <span>CTR: 4.2%</span>
            </div>
          </div>
        );

      case "whatsapp":
      case "crm":
      case "sales":
        return (
          <div className="flex h-full w-full flex-col justify-between p-1">
            <div className="flex justify-between items-center text-[7px] text-rose-300 font-bold">
              <span>CHAT</span>
              <span className="text-[5px] text-emerald-400">ONLINE</span>
            </div>
            <div className="space-y-0.5">
              <div className="h-1 w-7 rounded-sm bg-rose-500/40 ml-auto" />
              <div className="h-1 w-8 rounded-sm bg-slate-700/60 mr-auto" />
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-rose-400 animate-pulse" />
              <span className="text-[5px] text-rose-300">verified</span>
            </div>
          </div>
        );

      default: // Hermes
        return (
          <div className="flex h-full w-full flex-col justify-between p-1 font-mono">
            <div className="flex items-center justify-between text-[7px] text-cyan-300 font-bold">
              <span>ORCHESTRATOR</span>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <div className="relative flex h-4 w-full items-center justify-center">
              <div className="absolute h-4 w-4 rounded-full border border-cyan-400/40" />
              <div className="absolute h-2 w-2 rounded-full border border-indigo-400/50" />
              <div className="h-1 w-1 rounded-full bg-white shadow-md shadow-cyan-400" />
            </div>
            <div className="flex justify-between text-[5px] text-slate-300">
              <span>FLEET ACTIVE</span>
              <span>SYNCHRONIZED</span>
            </div>
          </div>
        );
    }
  };

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
      className={`group relative flex flex-col items-center justify-center p-2 transition-all duration-500 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cyan-400 ${
        isSelected
          ? "scale-105"
          : isHovered
          ? "scale-[1.03]"
          : "hover:scale-[1.02]"
      }`}
    >
      {/* 1. Floor Ambient Light Pool */}
      <div
        className="pointer-events-none absolute -bottom-3 h-14 w-44 rounded-full opacity-35 blur-xl transition-all duration-500 group-hover:opacity-65"
        style={{
          backgroundColor: isError ? "#f43f5e" : isBlocked ? "#f59e0b" : worker.accentColor,
        }}
      />

      {/* 2. Workstation Unit: Character Seated Behind Desk (Only when Present) */}
      <div className="relative flex flex-col items-center justify-center">
        {isWorkerPresent ? (
          <div className="relative z-10 -mb-6">
            <AgentCharacter
              name={worker.name}
              department={worker.department}
              state={worker.state}
              accentColor={worker.accentColor}
              secondaryColor={worker.secondaryColor}
              isHermes={isHermes}
              posture="SEATED"
            />
          </div>
        ) : (
          // Vacant Chair when worker is away
          <div className="relative z-10 -mb-2 flex flex-col items-center opacity-45 transition-opacity">
            <div className="h-6 w-12 rounded-t-md bg-slate-800 border border-slate-700 shadow-inner" />
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* 3. ISOMETRIC DESK & DUAL MONITORS                   */}
        {/* ---------------------------------------------------- */}
        <div className="relative z-20 flex flex-col items-center">
          <div className="flex items-end justify-center gap-1">
            {/* Main Center Curved Display */}
            <div
              className={`relative overflow-hidden rounded-t-md border bg-slate-950/95 transition-all duration-300 ${
                isWorking ? "office-screen-active" : ""
              }`}
              style={{
                width: isHermes ? "96px" : "80px",
                height: isHermes ? "38px" : "32px",
                borderColor: isWorking ? worker.accentColor : "#334155",
                boxShadow: isWorking
                  ? `0 0 16px ${worker.accentColor}40, inset 0 0 10px ${worker.accentColor}25`
                  : "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {renderMonitorVisuals(worker.department)}
              <div className="pointer-events-none absolute -right-4 -top-4 h-12 w-12 rotate-45 bg-gradient-to-b from-white/10 to-transparent" />
            </div>

            {/* Secondary Display */}
            <div
              className="relative hidden sm:flex overflow-hidden rounded-t-sm border border-slate-700/80 bg-slate-950/90 flex-col justify-between p-0.5"
              style={{
                width: isHermes ? "42px" : "34px",
                height: isHermes ? "34px" : "28px",
                borderColor: isWorking ? `${worker.accentColor}70` : "#334155",
              }}
            >
              {isWorking ? (
                <div className="flex flex-col justify-between h-full text-[5px] font-mono text-slate-300">
                  <span className="text-emerald-400 font-bold truncate">RUNNING</span>
                  <span className="text-slate-400 truncate max-w-[32px]">
                    {worker.currentMission?.currentStep || "active"}
                  </span>
                  <div className="h-0.5 w-full bg-emerald-500/30 overflow-hidden">
                    <div className="h-full bg-emerald-400 animate-pulse w-2/3" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-center items-center h-full gap-0.5 opacity-60">
                  <div className="h-0.5 w-4 rounded bg-slate-600" />
                  <div className="h-0.5 w-3 rounded bg-slate-600" />
                </div>
              )}
            </div>
          </div>

          {/* Desk Surface */}
          <div
            className="relative -mt-0.5 flex items-center justify-between px-3 rounded-b-xl border border-white/15 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-2xl transition-all duration-300"
            style={{
              width: isHermes ? "148px" : "126px",
              height: "22px",
            }}
          >
            <div className="mx-auto flex h-2 w-14 items-center justify-center rounded-sm bg-slate-950/90 border border-slate-700/60 shadow-inner">
              <div className="flex gap-0.5">
                <span className="h-0.5 w-1 rounded-full bg-slate-500" />
                <span className="h-0.5 w-1 rounded-full bg-slate-500" />
                <span className="h-0.5 w-2 rounded-full bg-slate-500" />
              </div>
            </div>

            <div className="absolute right-2 top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-700/80 border border-white/20 shadow-sm" title="Coffee mug">
              <span className="h-1 w-1 rounded-full bg-amber-900/80" />
            </div>

            <div
              className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full opacity-80 shadow-sm"
              style={{ backgroundColor: worker.accentColor }}
            />
          </div>

          <div className="flex justify-between w-full px-4 -mt-0.5">
            <div className="h-2 w-1 rounded-b bg-slate-700/80" />
            <div className="h-2 w-1 rounded-b bg-slate-700/80" />
          </div>
        </div>
      </div>

      {/* 4. Name & Department Badge */}
      <div className="mt-2 flex flex-col items-center">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs text-white tracking-wide flex items-center gap-1">
            {worker.name}
            {isHermes && <Zap className="h-3 w-3 text-cyan-400 fill-cyan-400" />}
          </span>
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
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {worker.departmentLabel}
          </span>
          {isWorking && (
            <span className="text-emerald-400 font-medium truncate max-w-[80px]">
              · {worker.statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Hover Peek "Eye" Icon */}
      <div className="absolute top-1 right-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-slate-300 backdrop-blur-sm shadow border border-white/15">
          <Eye className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
