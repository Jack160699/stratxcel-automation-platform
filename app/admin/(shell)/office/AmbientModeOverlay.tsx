"use client";

import { useEffect, useState } from "react";
import { Sparkles, Moon, Radio } from "lucide-react";
import type { OfficeTelemetry } from "./office-types";

interface AmbientModeOverlayProps {
  isActive: boolean;
  telemetry: OfficeTelemetry | null;
  onWake: () => void;
}

export function AmbientModeOverlay({
  isActive,
  telemetry,
  onWake,
}: AmbientModeOverlayProps) {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isActive) return null;

  const summary = telemetry?.summary;

  return (
    <div
      onClick={onWake}
      className="fixed inset-0 z-40 flex flex-col justify-between p-8 bg-slate-950/40 backdrop-blur-[2px] transition-all duration-700 cursor-pointer select-none"
    >
      {/* Top Screensaver Banner */}
      <div className="flex items-center justify-between text-xs tracking-widest uppercase font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="office-beacon absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500"></span>
          </span>
          <span className="text-white font-bold tracking-wider">
            STRATXCEL · DIGITAL HEADQUARTERS
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
          <Moon className="h-3.5 w-3.5 text-indigo-400" />
          <span>Ambient Screensaver Active</span>
        </div>
      </div>

      {/* Center Cinematic Clock */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="font-mono text-6xl md:text-8xl font-extralight tracking-wider text-white/90 drop-shadow-2xl">
          {currentTime}
        </div>
        <p className="mt-3 text-sm font-medium tracking-wide text-cyan-300/80 uppercase">
          {telemetry?.tenantName || "Stratxcel Workforce"} · Live Operations
        </p>

        {/* Live Pulse Ticker */}
        <div className="mt-4 flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span>{summary?.activeCount ?? 0} Workers Online</span>
          </div>
          <span>•</span>
          <span>{summary?.workingCount ?? 0} Executing</span>
          <span>•</span>
          <span>{summary?.waitingCount ?? 0} Standby</span>
        </div>
      </div>

      {/* Bottom Wake-up Hint */}
      <div className="flex justify-center text-xs text-slate-500 tracking-wider uppercase font-mono animate-pulse">
        Move mouse or press any key to resume controls
      </div>
    </div>
  );
}
