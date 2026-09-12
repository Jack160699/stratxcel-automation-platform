"use client";

import { useEffect, useState } from "react";
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
  if (!isActive) return null;

  return (
    <div
      onClick={onWake}
      className="fixed inset-0 z-30 pointer-events-auto cursor-pointer transition-opacity duration-1000 select-none"
    >
      {/* Subtle bottom screensaver hint that gently pulses */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-4 py-1.5 backdrop-blur-md shadow-2xl font-mono text-[10px] tracking-widest uppercase text-slate-400 opacity-60 hover:opacity-100 transition-opacity">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <span>AMBIENT SCREENSAVER · MOVE MOUSE TO RESUME</span>
      </div>
    </div>
  );
}
