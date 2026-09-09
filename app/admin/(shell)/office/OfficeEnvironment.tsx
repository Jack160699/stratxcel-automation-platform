"use client";

import { Coffee, Users, Shield, Sparkles } from "lucide-react";

export function OfficeEnvironment() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* ---------------------------------------------------- */}
      {/* 1. ACOUSTIC FLOOR WALKWAYS & CORRIDOR GUIDE LINES   */}
      {/* ---------------------------------------------------- */}
      <svg className="absolute inset-0 h-full w-full opacity-25" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="walkway-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* North-South Central Corridor Line */}
        <line x1="50%" y1="36%" x2="50%" y2="76%" stroke="url(#walkway-line-grad)" strokeWidth="1.5" strokeDasharray="6 6" />
        {/* East-West Cross Corridor Line */}
        <line x1="16%" y1="66%" x2="88%" y2="66%" stroke="url(#walkway-line-grad)" strokeWidth="1.5" strokeDasharray="6 6" />

        {/* Walkway Connector to Coffee Lounge */}
        <line x1="74%" y1="66%" x2="90%" y2="76%" stroke="url(#walkway-line-grad)" strokeWidth="1.5" strokeDasharray="4 4" />
        {/* Walkway Connector to Meeting Table */}
        <line x1="50%" y1="44%" x2="50%" y2="55%" stroke="url(#walkway-line-grad)" strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>

      {/* ---------------------------------------------------- */}
      {/* 2. SHARED CENTRAL MEETING / CONFERENCE TABLE         */}
      {/* ---------------------------------------------------- */}
      <div
        className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        style={{ width: "240px" }}
      >
        {/* Top Chair Backrests */}
        <div className="flex justify-around w-full px-6 -mb-2">
          <div className="h-3 w-7 rounded-t-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3 w-7 rounded-t-md bg-slate-800 border border-slate-700 shadow-sm" />
        </div>

        {/* Oval Conference Table Surface (Walnut & Frosted Inset) */}
        <div className="relative flex h-14 w-full items-center justify-between rounded-full border border-white/20 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 shadow-2xl backdrop-blur-md">
          {/* Frosted Center Glass Inlay */}
          <div className="mx-auto flex h-6 w-32 items-center justify-center rounded-full border border-cyan-400/20 bg-slate-950/60 text-[8px] font-mono tracking-wider text-cyan-300">
            <span className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5 text-cyan-400" />
              BRIEFING TABLE
            </span>
          </div>
        </div>

        {/* Bottom Chair Backrests */}
        <div className="flex justify-around w-full px-6 -mt-2">
          <div className="h-3 w-7 rounded-b-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3 w-7 rounded-b-md bg-slate-800 border border-slate-700 shadow-sm" />
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. COFFEE BAR & BREAK LOUNGE (Lower Right)          */}
      {/* ---------------------------------------------------- */}
      <div className="absolute right-4 bottom-12 lg:right-10 flex items-end gap-3">
        {/* Lounge Armchair */}
        <div className="flex flex-col items-center">
          <div className="h-10 w-12 rounded-xl border border-white/10 bg-slate-800/90 p-1.5 shadow-xl flex flex-col justify-between">
            <div className="h-1.5 w-full rounded bg-slate-700" />
            <div className="h-4 w-full rounded bg-slate-900/60" />
          </div>
          <span className="font-mono text-[8px] text-slate-500 mt-1 uppercase">Lounge</span>
        </div>

        {/* Espresso Counter & Coffee Machine */}
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-24 flex-col justify-between rounded-t-xl border border-white/15 bg-gradient-to-b from-slate-800 to-slate-950 p-2 shadow-2xl">
            {/* Stainless Espresso Machine with Warm Indicator LED */}
            <div className="flex items-center justify-between border-b border-white/10 pb-1">
              <div className="flex items-center gap-1 text-[8px] font-mono text-amber-300">
                <Coffee className="h-3 w-3 text-amber-400" />
                <span>CAFE</span>
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Coffee Cups on Tray */}
            <div className="flex gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-900 border border-white/30" />
              <div className="h-2 w-2 rounded-full bg-slate-300 border border-white/30" />
            </div>
          </div>
          <div className="h-1.5 w-26 bg-slate-900 rounded-b" />
        </div>

        {/* Potted Architectural Monstera Plant */}
        <div className="flex flex-col items-center office-plant-swaying">
          <div className="h-12 w-8 rounded-full bg-emerald-700/50 border border-emerald-400/30 blur-[0.5px]" />
          <div className="h-6 w-6 rounded-b-lg bg-zinc-900 border border-zinc-700 shadow-lg" />
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. ARCHITECTURAL GLASS SCREENS & ZONING DIVIDERS     */}
      {/* ---------------------------------------------------- */}
      {/* Left Terrace Glass Divider */}
      <div className="absolute left-[48%] top-[68%] h-20 w-0.5 bg-gradient-to-b from-cyan-400/30 via-white/10 to-transparent" />
      {/* Right Terrace Glass Divider */}
      <div className="absolute left-[52%] top-[68%] h-20 w-0.5 bg-gradient-to-b from-cyan-400/30 via-white/10 to-transparent" />
    </div>
  );
}
