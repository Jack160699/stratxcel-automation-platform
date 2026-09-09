"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Moon,
  Sparkles,
  Activity,
  Bot,
  Zap,
  Radio,
  Search,
  ArrowRight,
} from "lucide-react";
import type { OfficeTelemetry } from "./office-types";

interface OfficeStatusBarProps {
  telemetry: OfficeTelemetry | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEnterAmbientMode: () => void;
  isAmbientMode: boolean;
  mouseActive: boolean;
  isActivityPanelOpen?: boolean;
  onToggleActivityPanel?: () => void;
  onExecuteCommand?: (cmd: string) => void;
}

export function OfficeStatusBar({
  telemetry,
  isFullscreen,
  onToggleFullscreen,
  onEnterAmbientMode,
  isAmbientMode,
  mouseActive,
  isActivityPanelOpen = false,
  onToggleActivityPanel,
  onExecuteCommand,
}: OfficeStatusBarProps) {
  const [clockText, setClockText] = useState<{ time: string; day: string; date: string }>({
    time: "",
    day: "",
    date: "",
  });
  const [commandInput, setCommandInput] = useState("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setClockText({
        time: now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        day: now.toLocaleDateString(undefined, { weekday: "short" }),
        date: now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      });
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const summary = telemetry?.summary ?? {
    activeCount: 12,
    workingCount: 8,
    waitingCount: 2,
    allAgentsIdle: false,
  };

  const QUICK_COMMANDS = [
    "Get 100 solar leads this month",
    "Grow MBBS admissions in Russia",
    "Launch new opportunity",
  ];

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onExecuteCommand?.(commandInput.trim());
    setCommandInput("");
  };

  return (
    <header
      style={{
        paddingRight: isActivityPanelOpen ? "345px" : "1.5rem",
      }}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-3 transition-all duration-300"
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP-LEFT: BRAND IDENTITY & ADMIN LINK                     */}
      {/* ------------------------------------------------------------- */}
      <div className="pointer-events-auto flex items-center gap-3">
        <Link
          href="/admin"
          className="group flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-slate-400 backdrop-blur-xl shadow-lg hover:border-cyan-400/40 hover:bg-slate-900 hover:text-white transition-all active:scale-95"
          aria-label="Return to Admin Dashboard"
          title="Back to Admin Dashboard"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        </Link>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-wide text-white drop-shadow-md">
              StratXcel
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-cyan-300">
              Autonomous Company HQ
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
            Ideas → Execution → Real World Impact
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. TOP-CENTER: SLEEK EXECUTIVE COMMAND BAR                    */}
      {/* ------------------------------------------------------------- */}
      <div className="pointer-events-auto hidden lg:flex flex-col items-center">
        <form
          onSubmit={handleCommandSubmit}
          className="flex h-9 w-[440px] items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/80 px-3.5 shadow-2xl backdrop-blur-2xl transition-all focus-within:border-cyan-400/60 focus-within:bg-slate-900/90"
        >
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Give Hermes a command…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!commandInput.trim()}
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Send directive to Hermes"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="mt-1 flex items-center gap-2 text-[9px] text-slate-400 font-mono">
          {QUICK_COMMANDS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onExecuteCommand?.(chip)}
              className="hover:text-cyan-300 transition-colors truncate max-w-[170px]"
            >
              &quot;{chip}&quot;
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TOP-RIGHT: HERMES STATUS + LIVE CLOCK + PANEL TOGGLE       */}
      {/* ------------------------------------------------------------- */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Hermes CEO Profile Pill */}
        <div className="hidden sm:flex items-center gap-2.5 rounded-2xl border border-white/15 bg-slate-950/80 px-3 py-1.5 backdrop-blur-2xl shadow-xl">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 p-0.5">
            <Bot className="h-4 w-4 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-950 animate-pulse" />
          </div>
          <div className="flex flex-col text-left leading-tight">
            <span className="text-[11px] font-bold text-white tracking-wide">
              Hermes
            </span>
            <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
              CEO & Operating System • Active
            </span>
          </div>
        </div>

        {/* Clock & Realtime Status */}
        <div className="hidden md:flex flex-col text-right leading-tight font-mono">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-[11px] font-bold text-white tracking-wide">
              {clockText.time}
            </span>
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[8px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-500/30">
              Live
            </span>
          </div>
          <span className="text-[8px] text-slate-400">
            {clockText.day}, {clockText.date}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {onToggleActivityPanel && (
            <button
              type="button"
              onClick={onToggleActivityPanel}
              title={isActivityPanelOpen ? "Close Live Activity Panel" : "Open Live Activity Panel"}
              className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-mono font-bold backdrop-blur-2xl transition-all active:scale-95 ${
                isActivityPanelOpen
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                  : "border-white/15 bg-slate-950/80 text-slate-300 hover:text-white hover:border-white/30"
              }`}
              aria-label="Toggle Live Activity panel"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[10px] font-sans font-semibold">Live Activity</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-slate-950/80 text-slate-400 hover:text-white hover:border-white/30 backdrop-blur-2xl transition-all active:scale-95 shadow-lg"
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-cyan-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
