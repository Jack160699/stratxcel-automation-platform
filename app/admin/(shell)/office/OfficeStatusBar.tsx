"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2, Moon, Sparkles, Activity } from "lucide-react";
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
}: OfficeStatusBarProps) {
  const [clockText, setClockText] = useState<{ time: string; day: string }>({
    time: "",
    day: "",
  });

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setClockText({
        time: now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        day: now.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
      });
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const summary = telemetry?.summary ?? {
    activeCount: 0,
    workingCount: 0,
    waitingCount: 0,
    allAgentsIdle: true,
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between p-4 md:p-6 transition-opacity duration-700">
      {/* 1. Subtle Top-Left "← Admin" Exit Affordance (Reveals on mouse activity) */}
      <div
        className={`pointer-events-auto transition-all duration-500 ${
          mouseActive && !isAmbientMode ? "opacity-90 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <Link
          href="/admin"
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3.5 py-1.5 text-xs font-medium text-slate-400 backdrop-blur-xl shadow-xl hover:border-cyan-400/40 hover:bg-slate-900/90 hover:text-white transition-all active:scale-95"
          aria-label="Return to Admin Dashboard"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Admin</span>
        </Link>
      </div>

      {/* 2. Top-Right Subtle HUD: Live Status + Clock + Fullscreen */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Subtle Live Status */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3.5 py-1.5 text-xs font-mono backdrop-blur-xl shadow-xl">
          <span className="relative flex h-2 w-2">
            <span className="office-beacon absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-bold text-white tracking-wider text-[11px]">
            {summary.workingCount > 0
              ? `${summary.workingCount} WORKING`
              : "LIVE FLEET"}
          </span>
          <span className="text-[10px] text-slate-400">
            · {summary.activeCount} ACTIVE
          </span>
        </div>

        {/* Real-time Clock */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/70 px-3.5 py-1.5 font-mono text-xs backdrop-blur-xl shadow-xl text-slate-300">
          <span className="font-semibold text-white tracking-wide">{clockText.time}</span>
          <span className="text-[10px] text-slate-400">· {clockText.day}</span>
        </div>

        {/* Subtle Controls (Execution Panel, Screensaver & Fullscreen) */}
        <div
          className={`flex items-center gap-1.5 transition-opacity duration-500 ${
            mouseActive && !isAmbientMode ? "opacity-100" : "opacity-40 hover:opacity-100"
          }`}
        >
          {onToggleActivityPanel && (
            <button
              type="button"
              onClick={onToggleActivityPanel}
              title={isActivityPanelOpen ? "Close Execution Panel" : "Open Execution Panel"}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-mono font-bold backdrop-blur-xl transition-all active:scale-95 ${
                isActivityPanelOpen
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                  : "border-white/10 bg-slate-950/70 text-slate-400 hover:text-white hover:border-white/25"
              }`}
              aria-label="Toggle execution panel"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden md:inline text-[10px]">PANEL</span>
            </button>
          )}

          <button
            type="button"
            onClick={onEnterAmbientMode}
            title="Enter ambient screensaver mode"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-slate-400 hover:text-white hover:border-white/25 backdrop-blur-xl transition-all active:scale-95"
            aria-label="Enter ambient screensaver"
          >
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-slate-400 hover:text-white hover:border-white/25 backdrop-blur-xl transition-all active:scale-95"
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-cyan-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
