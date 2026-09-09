"use client";

import { useEffect, useState } from "react";
import { Sparkles, Maximize2, Minimize2, Activity, RefreshCw } from "lucide-react";
import type { OfficeTelemetry } from "./office-types";

interface OfficeStatusBarProps {
  telemetry: OfficeTelemetry | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEnterAmbientMode: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function OfficeStatusBar({
  telemetry,
  isFullscreen,
  onToggleFullscreen,
  onEnterAmbientMode,
  onRefresh,
  isRefreshing = false,
}: OfficeStatusBarProps) {
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  useEffect(() => {
    if (!telemetry?.generatedAt) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - new Date(telemetry.generatedAt).getTime()) / 1000
      );
      setSecondsAgo(Math.max(0, elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [telemetry?.generatedAt]);

  const summary = telemetry?.summary ?? {
    activeCount: 0,
    workingCount: 0,
    waitingCount: 0,
    blockedCount: 0,
    errorCount: 0,
    allAgentsIdle: true,
  };

  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 backdrop-blur-xl shadow-2xl transition-all duration-300">
      {/* Left: Live Status Indicators */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <div className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-2.5 py-1 text-indigo-300 border border-indigo-500/20">
          <span className="relative flex h-2 w-2">
            <span className="office-beacon absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
          </span>
          <span className="font-semibold tracking-wide">{summary.activeCount} ACTIVE</span>
        </div>

        {summary.workingCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-emerald-300 border border-emerald-500/20">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{summary.workingCount} WORKING</span>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-2.5 py-1 text-sky-300 border border-sky-500/20">
          <span className="h-2 w-2 rounded-full bg-sky-400"></span>
          <span>{summary.waitingCount} WAITING</span>
        </div>

        {summary.blockedCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-300 border border-amber-500/20">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>{summary.blockedCount} BLOCKED</span>
          </div>
        ) : null}

        {summary.errorCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-2.5 py-1 text-rose-300 border border-rose-500/20">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <span>{summary.errorCount} ERROR</span>
          </div>
        ) : null}

        {summary.allAgentsIdle ? (
          <span className="hidden sm:inline-block rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
            All agents idle
          </span>
        ) : null}
      </div>

      {/* Right: Controls & Realtime Heartbeat */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pr-2 border-r border-white/10">
          <Activity className="h-3 w-3 text-emerald-400" />
          <span>Updated {secondsAgo}s ago</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh office telemetry"
            className="ml-1 rounded p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>

        <button
          type="button"
          onClick={onEnterAmbientMode}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-white/10 hover:text-white hover:border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          aria-label="Enter screensaver ambient mode"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          <span className="hidden sm:inline">Ambient Mode</span>
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-white/10 hover:text-white hover:border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5 text-sky-300" />
              <span className="hidden sm:inline">Exit Fullscreen</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5 text-sky-300" />
              <span className="hidden sm:inline">Fullscreen</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
