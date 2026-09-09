"use client";

import { Coffee, Users, Shield, Sparkles, Gamepad2, Utensils, Trees, Monitor, Activity, Zap } from "lucide-react";

export function OfficeEnvironment() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
      {/* ---------------------------------------------------- */}
      {/* 1. ACOUSTIC FLOOR WALKWAYS & CORRIDOR GUIDE LINES   */}
      {/* ---------------------------------------------------- */}
      <svg className="absolute inset-0 h-full w-full opacity-30" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="corridor-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="warm-glow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="neon-glow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Central North-South Spine */}
        <line x1="50%" y1="18%" x2="50%" y2="88%" stroke="url(#corridor-glow)" strokeWidth="2" strokeDasharray="8 6" />

        {/* East-West Cross Corridor 1 (Meeting Room / CEO Junction) */}
        <line x1="12%" y1="31%" x2="88%" y2="31%" stroke="url(#corridor-glow)" strokeWidth="1.5" strokeDasharray="6 6" />

        {/* East-West Cross Corridor 2 (Mid Department Tier) */}
        <line x1="14%" y1="55%" x2="86%" y2="55%" stroke="url(#corridor-glow)" strokeWidth="1.5" strokeDasharray="6 6" />

        {/* East-West Cross Corridor 3 (South Fleet & Eng Tier) */}
        <line x1="20%" y1="74%" x2="80%" y2="74%" stroke="url(#corridor-glow)" strokeWidth="1.5" strokeDasharray="6 6" />

        {/* Diagonal Runway Connectors to Amenity Rooms */}
        <line x1="12%" y1="20%" x2="50%" y2="31%" stroke="url(#corridor-glow)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="88%" y1="20%" x2="50%" y2="31%" stroke="url(#corridor-glow)" strokeWidth="1" strokeDasharray="4 4" />
      </svg>

      {/* ---------------------------------------------------- */}
      {/* 2. CEO / HERMES EXECUTIVE DAIS (North Center)       */}
      {/* ---------------------------------------------------- */}
      <div className="absolute left-1/2 top-[22%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
        {/* Holographic Radar Ring Floor Projector */}
        <div className="h-40 w-56 rounded-full border border-cyan-400/20 bg-cyan-500/[0.03] shadow-[0_0_50px_rgba(6,182,212,0.15)]" />
        {/* Subtle glass partition behind executive suite */}
        <div className="absolute -top-8 h-1 w-64 rounded-full bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. CENTRAL MEETING ROOM & BRIEFING TABLE (Center)    */}
      {/* ---------------------------------------------------- */}
      <div
        className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        style={{ width: "290px" }}
      >
        {/* Frosted Glass Conference Enclosure Walls */}
        <div className="absolute -inset-4 rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900/60 via-slate-950/40 to-slate-900/60 shadow-2xl backdrop-blur-sm" />

        {/* Meeting Room Overhead Signage */}
        <div className="relative -mt-2 mb-2 flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-0.5 font-mono text-[8px] font-bold text-cyan-300 tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>CONFERENCE & STRATEGY ROOM</span>
        </div>

        {/* Top Chair Backrests */}
        <div className="relative z-10 flex justify-around w-full px-8 -mb-2">
          <div className="h-3.5 w-8 rounded-t-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3.5 w-8 rounded-t-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3.5 w-8 rounded-t-md bg-slate-800 border border-slate-700 shadow-sm" />
        </div>

        {/* Oval Executive Table Surface */}
        <div className="relative z-10 flex h-16 w-full items-center justify-between rounded-full border border-white/25 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 shadow-2xl backdrop-blur-md">
          {/* Frosted Inlay with Holographic Briefing Display */}
          <div className="mx-auto flex h-7 w-44 items-center justify-center rounded-full border border-cyan-400/30 bg-slate-950/70 text-[9px] font-mono tracking-wider text-cyan-300 shadow-inner">
            <span className="flex items-center gap-1.5 font-bold">
              <Users className="h-3 w-3 text-cyan-400" />
              <span>ORCHESTRATION BRIEFING TABLE</span>
            </span>
          </div>
        </div>

        {/* Bottom Chair Backrests */}
        <div className="relative z-10 flex justify-around w-full px-8 -mt-2">
          <div className="h-3.5 w-8 rounded-b-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3.5 w-8 rounded-b-md bg-slate-800 border border-slate-700 shadow-sm" />
          <div className="h-3.5 w-8 rounded-b-md bg-slate-800 border border-slate-700 shadow-sm" />
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. COFFEE LOUNGE (North-East Zone)                  */}
      {/* ---------------------------------------------------- */}
      <div className="absolute right-4 top-[14%] xl:right-10 flex flex-col items-center">
        <div className="relative flex items-end gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-3 shadow-2xl backdrop-blur-md">
          {/* Warm Floor Accent */}
          <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-amber-500/10 blur-lg" />

          {/* Lounge Armchair */}
          <div className="relative flex flex-col items-center">
            <div className="h-10 w-12 rounded-xl border border-white/15 bg-slate-800/90 p-1.5 shadow-xl flex flex-col justify-between">
              <div className="h-1.5 w-full rounded bg-slate-700" />
              <div className="h-4 w-full rounded bg-slate-900/60" />
            </div>
            <span className="font-mono text-[7px] text-amber-400/80 mt-1 uppercase font-bold">Lounge</span>
          </div>

          {/* Espresso Bar & Machine */}
          <div className="relative flex flex-col items-center">
            <div className="relative flex h-16 w-24 flex-col justify-between rounded-t-xl border border-amber-500/30 bg-gradient-to-b from-slate-800 to-slate-950 p-2 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-1">
                <div className="flex items-center gap-1 text-[8px] font-mono text-amber-300 font-bold">
                  <Coffee className="h-3 w-3 text-amber-400" />
                  <span>CAFE</span>
                </div>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-900 border border-white/30" />
                <div className="h-2 w-2 rounded-full bg-slate-300 border border-white/30" />
                <span className="text-[6px] font-mono text-amber-200">STEAM</span>
              </div>
            </div>
            <div className="h-1.5 w-26 bg-slate-900 rounded-b border-t border-white/10" />
          </div>

          {/* Architectural Monstera Plant */}
          <div className="relative flex flex-col items-center office-plant-swaying">
            <div className="h-12 w-8 rounded-full bg-emerald-600/40 border border-emerald-400/30 blur-[0.5px]" />
            <div className="h-5 w-6 rounded-b-lg bg-zinc-900 border border-zinc-700 shadow-lg" />
          </div>
        </div>
        <span className="mt-1 font-mono text-[8px] font-bold text-amber-400 uppercase tracking-widest">
          COFFEE LOUNGE
        </span>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 5. KITCHEN / BREAK AREA (North-West Zone)            */}
      {/* ---------------------------------------------------- */}
      <div className="absolute left-4 top-[14%] xl:left-10 flex flex-col items-center">
        <div className="relative flex items-end gap-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-slate-900/80 to-slate-950/90 p-3 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-emerald-500/10 blur-lg" />

          {/* Refrigerator */}
          <div className="relative flex h-18 w-11 flex-col justify-between rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 p-1 shadow-lg">
            <div className="h-7 w-full rounded border-b border-slate-600/80 bg-slate-800/80 flex items-center justify-end px-1">
              <div className="h-3 w-0.5 rounded bg-slate-400" />
            </div>
            <div className="h-8 w-full rounded bg-slate-850 flex items-center justify-end px-1">
              <div className="h-4 w-0.5 rounded bg-slate-400" />
            </div>
          </div>

          {/* Kitchen Dining Counter */}
          <div className="relative flex flex-col items-center">
            <div className="relative flex h-14 w-24 flex-col justify-between rounded-t-xl border border-emerald-400/25 bg-gradient-to-b from-slate-800 to-slate-950 p-1.5 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-1">
                <div className="flex items-center gap-1 text-[8px] font-mono text-emerald-300 font-bold">
                  <Utensils className="h-2.5 w-2.5 text-emerald-400" />
                  <span>KITCHEN</span>
                </div>
                <span className="text-[6px] font-mono text-emerald-400">ORGANIC</span>
              </div>
              <div className="flex justify-around items-center">
                <div className="h-2 w-3 rounded-sm bg-slate-300 border border-slate-600" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-600/50" />
              </div>
            </div>
            <div className="h-1.5 w-26 bg-slate-900 rounded-b border-t border-white/10" />
          </div>

          {/* Bar Stool */}
          <div className="relative flex flex-col items-center">
            <div className="h-3 w-6 rounded-t-md bg-emerald-950/80 border border-emerald-500/40" />
            <div className="h-6 w-1 bg-slate-700" />
            <div className="h-1 w-5 rounded bg-slate-800 border border-slate-600" />
          </div>
        </div>
        <span className="mt-1 font-mono text-[8px] font-bold text-emerald-400 uppercase tracking-widest">
          KITCHEN & BREAK
        </span>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 6. GAMING ROOM (Mid-West Zone)                      */}
      {/* ---------------------------------------------------- */}
      <div className="absolute left-4 top-[38%] xl:left-8 flex flex-col items-center">
        <div className="relative flex items-end gap-2.5 rounded-2xl border border-pink-500/25 bg-gradient-to-b from-slate-900/85 to-purple-950/90 p-3 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-pink-500/15 blur-lg" />

          {/* Arcade Cabinet */}
          <div className="relative flex h-18 w-11 flex-col justify-between rounded-t-lg border border-pink-400/40 bg-slate-950 p-1 shadow-2xl">
            {/* Illuminated Marquee */}
            <div className="h-3 w-full rounded-sm bg-gradient-to-r from-pink-500 to-purple-500 text-[6px] font-mono font-bold text-white flex items-center justify-center shadow-md">
              <span>ARCADE</span>
            </div>
            {/* CRT Screen with 8-bit visual */}
            <div className="my-1 h-6 w-full rounded border border-pink-500/30 bg-purple-950/80 flex items-center justify-center">
              <span className="text-[6px] font-mono text-cyan-300 animate-pulse">1P READY</span>
            </div>
            {/* Joystick Panel */}
            <div className="h-3 w-full bg-slate-800 rounded-b flex items-center justify-around px-1">
              <div className="h-1.5 w-1 rounded-full bg-rose-500" />
              <div className="h-1 w-1 rounded-full bg-blue-400" />
            </div>
          </div>

          {/* Gaming Lounge Couch */}
          <div className="relative flex flex-col items-center">
            <div className="h-10 w-16 rounded-xl border border-purple-400/30 bg-purple-950/60 p-1 shadow-lg flex flex-col justify-between">
              <div className="h-2 w-full rounded bg-purple-900/80" />
              <div className="flex justify-center gap-1">
                <Gamepad2 className="h-3 w-3 text-pink-400" />
              </div>
            </div>
            <span className="font-mono text-[7px] text-purple-300 font-bold mt-0.5">CONSOLE</span>
          </div>
        </div>
        <span className="mt-1 font-mono text-[8px] font-bold text-pink-400 uppercase tracking-widest">
          GAMING ROOM
        </span>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 7. RELAXATION AREA & ZEN GARDEN (Mid-East Zone)     */}
      {/* ---------------------------------------------------- */}
      <div className="absolute right-4 top-[38%] xl:right-8 flex flex-col items-center">
        <div className="relative flex items-end gap-3 rounded-2xl border border-teal-500/25 bg-gradient-to-b from-slate-900/85 to-teal-950/80 p-3 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-teal-500/15 blur-lg" />

          {/* Zen Indoor Plant */}
          <div className="relative flex flex-col items-center office-plant-swaying">
            <div className="h-14 w-9 rounded-full bg-teal-600/35 border border-teal-400/30 blur-[0.5px]" />
            <div className="h-5 w-7 rounded-b-xl bg-zinc-900 border border-zinc-700 shadow-md" />
          </div>

          {/* Ergonomic Zen Beanbag */}
          <div className="relative flex flex-col items-center">
            <div className="h-10 w-14 rounded-full border border-teal-400/30 bg-teal-900/50 p-2 shadow-xl flex items-center justify-center">
              <Trees className="h-4 w-4 text-teal-300 opacity-80" />
            </div>
            <span className="font-mono text-[7px] text-teal-300 font-bold mt-1">ZEN ZONE</span>
          </div>
        </div>
        <span className="mt-1 font-mono text-[8px] font-bold text-teal-400 uppercase tracking-widest">
          RELAXATION AREA
        </span>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 8. ARCHITECTURAL GLASS SCREENS & ZONING DIVIDERS     */}
      {/* ---------------------------------------------------- */}
      {/* West Glass Partition Line */}
      <div className="absolute left-[24%] top-[40%] h-48 w-0.5 bg-gradient-to-b from-cyan-400/25 via-white/10 to-transparent" />
      {/* East Glass Partition Line */}
      <div className="absolute left-[76%] top-[40%] h-48 w-0.5 bg-gradient-to-b from-cyan-400/25 via-white/10 to-transparent" />
    </div>
  );
}
