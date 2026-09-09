"use client";

import { useState } from "react";
import {
  Sparkles,
  Users,
  Coffee,
  Gamepad2,
  Utensils,
  Trees,
  Bot,
  TrendingUp,
  Search,
  Code2,
  ShieldCheck,
  Compass,
  PieChart,
  Globe2,
} from "lucide-react";

interface OfficeEnvironmentProps {
  hermesObjective?: string;
  isMeetingActive?: boolean;
  activeCount?: number;
  meetingTopic?: string;
  onSelectRoom?: (roomKey: string) => void;
}

export function OfficeEnvironment({
  hermesObjective = "Planning next steps... 12 missions in progress",
  isMeetingActive = true,
  activeCount = 12,
  meetingTopic = "Aligning on Solar Leads Strategy",
  onSelectRoom,
}: OfficeEnvironmentProps) {
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-0 h-full w-full overflow-hidden select-none">
      {/* ------------------------------------------------------------- */}
      {/* 1. PHOTOREALISTIC 3D ARCHITECTURAL CUTAWAY BASE RENDER        */}
      {/* ------------------------------------------------------------- */}
      <div
        className="absolute inset-0 h-full w-full bg-cover bg-center transition-transform duration-700 ease-out"
        style={{
          backgroundImage: "url('/images/office/stratxcel-hq-cinematic.jpg')",
          filter: "brightness(0.99) contrast(1.03)",
        }}
      />

      {/* Atmospheric Vignette & Deep Cinematic Lighting */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/30 pointer-events-none" />
      <div className="absolute inset-0 bg-radial from-transparent via-transparent to-black/50 pointer-events-none" />

      {/* ------------------------------------------------------------- */}
      {/* 2. DYNAMIC ARCHITECTURAL LIGHTING POOLS                       */}
      {/* ------------------------------------------------------------- */}

      {/* Central Atrium Bioluminescent Tree Radiance */}
      <div
        className="pointer-events-none absolute left-[47%] top-[57%] -translate-x-1/2 -translate-y-1/2 h-36 w-36 rounded-full opacity-60 mix-blend-screen animate-pulse"
        style={{
          background: "radial-gradient(circle, rgba(52, 211, 153, 0.45) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 80%)",
        }}
      />

      {/* Gaming Room Neon Purple Ambience (Ground West) */}
      <div
        className="pointer-events-none absolute left-[15%] top-[82%] -translate-x-1/2 -translate-y-1/2 h-44 w-60 rounded-3xl opacity-50 mix-blend-screen"
        style={{
          background: "radial-gradient(ellipse, rgba(168, 85, 247, 0.35) 0%, rgba(236, 72, 153, 0.1) 60%, transparent 80%)",
        }}
      />

      {/* Relaxation Area Warm Amber Glow (Ground East-Center) */}
      <div
        className="pointer-events-none absolute left-[59%] top-[82%] -translate-x-1/2 -translate-y-1/2 h-40 w-56 rounded-3xl opacity-45 mix-blend-screen"
        style={{
          background: "radial-gradient(ellipse, rgba(245, 158, 11, 0.35) 0%, rgba(217, 119, 6, 0.1) 60%, transparent 80%)",
        }}
      />

      {/* CEO Penthouse Executive Dais Aura (Level 3 Center) */}
      <div
        className="pointer-events-none absolute left-[45%] top-[22%] -translate-x-1/2 -translate-y-1/2 h-44 w-64 rounded-full opacity-50 mix-blend-screen"
        style={{
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(99, 102, 241, 0.15) 55%, transparent 75%)",
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* 3. DYNAMIC EXECUTIVE & MEETING SPEECH BUBBLES (MATCHING REF)  */}
      {/* ------------------------------------------------------------- */}

      {/* CEO / HERMES EXECUTIVE SUITE & THOUGHT BUBBLE */}
      <div
        className="absolute left-[39%] top-[14%] h-[18%] w-[13%] cursor-pointer rounded-2xl transition-all duration-300 group z-20"
        aria-label="CEO / HERMES"
        title="CEO / HERMES"
        onMouseEnter={() => setHoveredRoom("hermes")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("hermes")}
      >
        <div className="absolute inset-0 rounded-2xl border border-cyan-400/0 group-hover:border-cyan-400/40 group-hover:bg-cyan-500/[0.08] transition-all" />

        {/* Dynamic Executive Thought Bubble matching Reference */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-max max-w-[190px] rounded-xl border border-white/20 bg-slate-950/85 px-3 py-1.5 shadow-2xl backdrop-blur-xl pointer-events-none">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-mono text-[9px] font-bold text-cyan-300 tracking-wider">
              CEO / HERMES
            </span>
          </div>
          <p className="text-[10px] text-white font-medium leading-tight">
            {hermesObjective.toLowerCase().includes("standby") || hermesObjective.toLowerCase().includes("available")
              ? "Planning next steps..."
              : hermesObjective}
          </p>
          <span className="text-[8px] font-mono text-slate-400">
            {activeCount} missions in progress
          </span>
        </div>
      </div>

      {/* CONFERENCE & MEETING ROOM (Boardroom) */}
      <div
        className="absolute left-[54%] top-[15%] h-[18%] w-[16%] cursor-pointer rounded-2xl transition-all duration-300 group z-20"
        aria-label="CONFERENCE & STRATEGY ROOM"
        title="CONFERENCE & STRATEGY ROOM"
        onMouseEnter={() => setHoveredRoom("meeting")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("meeting")}
      >
        <div className="absolute inset-0 rounded-2xl border border-indigo-400/0 group-hover:border-indigo-400/40 group-hover:bg-indigo-500/[0.08] transition-all" />

        {/* Dynamic Boardroom Meeting Pill matching Reference */}
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/85 px-3 py-1 shadow-xl backdrop-blur-xl pointer-events-none whitespace-nowrap">
          <span className="text-[10px] text-slate-200 font-medium">
            {meetingTopic}
          </span>
          <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Live
          </span>
        </div>
      </div>

      {/* COFFEE LOUNGE (Penthouse Far Right) */}
      <div
        className="absolute left-[73%] top-[15%] h-[18%] w-[15%] cursor-pointer rounded-2xl transition-all duration-300 group z-20"
        aria-label="COFFEE LOUNGE"
        title="COFFEE LOUNGE"
        onMouseEnter={() => setHoveredRoom("coffee")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("coffee")}
      >
        <div className="absolute inset-0 rounded-2xl border border-amber-400/0 group-hover:border-amber-400/40 group-hover:bg-amber-500/[0.08] transition-all" />
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2.5 py-0.5 font-mono text-[9px] text-slate-300 pointer-events-none whitespace-nowrap">
          <span>Great ideas happen here</span>
        </div>
      </div>

      {/* CENTRAL ATRIUM ILLUMINATED RING (StratXcel Together We Build More) */}
      <div
        className="absolute left-[47%] top-[62%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-slate-950/90 px-3 py-1 shadow-2xl backdrop-blur-xl">
          <span className="text-cyan-400 font-bold text-[10px] tracking-wide">❖ StratXcel</span>
          <span className="text-slate-400 text-[8px] font-medium">Together We Build More</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. INTERACTIVE ROOM HOVER BOUNDARIES (SUBTLE HIGHLIGHT ON HOVER) */}
      {/* ------------------------------------------------------------- */}

      {/* Research (Market Intelligence) */}
      <div
        className="absolute left-[8%] top-[37%] h-[16%] w-[12%] cursor-pointer rounded-2xl group"
        aria-label="RESEARCH"
        title="RESEARCH"
        onMouseEnter={() => setHoveredRoom("research")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("research")}
      >
        <div className="absolute inset-0 rounded-2xl border border-amber-400/0 group-hover:border-amber-400/40 group-hover:bg-amber-500/[0.08] transition-all" />
        <span className="sr-only">RESEARCH</span>
        {hoveredRoom === "research" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-amber-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            RESEARCH
          </div>
        )}
      </div>

      {/* Marketing (Content & Growth) */}
      <div
        className="absolute left-[20%] top-[37%] h-[16%] w-[11%] cursor-pointer rounded-2xl group"
        aria-label="MARKETING"
        title="MARKETING"
        onMouseEnter={() => setHoveredRoom("marketing")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("marketing")}
      >
        <div className="absolute inset-0 rounded-2xl border border-purple-400/0 group-hover:border-purple-400/40 group-hover:bg-purple-500/[0.08] transition-all" />
        <span className="sr-only">MARKETING</span>
        {hoveredRoom === "marketing" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-purple-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-purple-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            MARKETING
          </div>
        )}
      </div>

      {/* Sales (Leads & Conversions) */}
      <div
        className="absolute left-[31%] top-[37%] h-[16%] w-[11%] cursor-pointer rounded-2xl group"
        aria-label="SALES"
        title="SALES"
        onMouseEnter={() => setHoveredRoom("sales")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("sales")}
      >
        <div className="absolute inset-0 rounded-2xl border border-emerald-400/0 group-hover:border-emerald-400/40 group-hover:bg-emerald-500/[0.08] transition-all" />
        <span className="sr-only">SALES</span>
        {hoveredRoom === "sales" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-emerald-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            SALES
          </div>
        )}
      </div>

      {/* Operations (Delivery & Execution) */}
      <div
        className="absolute left-[56%] top-[37%] h-[16%] w-[11%] cursor-pointer rounded-2xl group"
        aria-label="OPERATIONS"
        title="OPERATIONS"
        onMouseEnter={() => setHoveredRoom("operations")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("operations")}
      >
        <div className="absolute inset-0 rounded-2xl border border-cyan-400/0 group-hover:border-cyan-400/40 group-hover:bg-cyan-500/[0.08] transition-all" />
        <span className="sr-only">OPERATIONS</span>
        {hoveredRoom === "operations" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-cyan-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            OPERATIONS
          </div>
        )}
      </div>

      {/* Finance (Payments & Revenue) */}
      <div
        className="absolute left-[68%] top-[37%] h-[16%] w-[11%] cursor-pointer rounded-2xl group"
        aria-label="FINANCE"
        title="FINANCE"
        onMouseEnter={() => setHoveredRoom("finance")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("finance")}
      >
        <div className="absolute inset-0 rounded-2xl border border-teal-400/0 group-hover:border-teal-400/40 group-hover:bg-teal-500/[0.08] transition-all" />
        <span className="sr-only">FINANCE</span>
        {hoveredRoom === "finance" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-teal-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-teal-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            FINANCE
          </div>
        )}
      </div>

      {/* Engineering (Build & Enable) */}
      <div
        className="absolute left-[8%] top-[55%] h-[17%] w-[12%] cursor-pointer rounded-2xl group"
        aria-label="ENGINEERING"
        title="ENGINEERING"
        onMouseEnter={() => setHoveredRoom("engineering")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("engineering")}
      >
        <div className="absolute inset-0 rounded-2xl border border-blue-400/0 group-hover:border-blue-400/40 group-hover:bg-blue-500/[0.08] transition-all" />
        <span className="sr-only">ENGINEERING</span>
        {hoveredRoom === "engineering" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-blue-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-blue-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            ENGINEERING
          </div>
        )}
      </div>

      {/* HR / People (Culture & Talent) */}
      <div
        className="absolute left-[20%] top-[55%] h-[17%] w-[12%] cursor-pointer rounded-2xl group"
        aria-label="HR / PEOPLE"
        title="HR / PEOPLE"
        onMouseEnter={() => setHoveredRoom("people")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("people")}
      >
        <div className="absolute inset-0 rounded-2xl border border-rose-400/0 group-hover:border-rose-400/40 group-hover:bg-rose-500/[0.08] transition-all" />
        <span className="sr-only">HR / PEOPLE</span>
        {hoveredRoom === "people" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-rose-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-rose-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            HR / PEOPLE
          </div>
        )}
      </div>

      {/* CRM (Customers for Life) */}
      <div
        className="absolute left-[58%] top-[55%] h-[17%] w-[12%] cursor-pointer rounded-2xl group"
        aria-label="CRM"
        title="CRM"
        onMouseEnter={() => setHoveredRoom("crm")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("crm")}
      >
        <div className="absolute inset-0 rounded-2xl border border-violet-400/0 group-hover:border-violet-400/40 group-hover:bg-violet-500/[0.08] transition-all" />
        <span className="sr-only">CRM</span>
        {hoveredRoom === "crm" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-violet-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-violet-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            CRM
          </div>
        )}
      </div>

      {/* Analytics & Decisions */}
      <div
        className="absolute left-[70%] top-[55%] h-[17%] w-[12%] cursor-pointer rounded-2xl group"
        aria-label="ANALYTICS"
        title="ANALYTICS"
        onMouseEnter={() => setHoveredRoom("analytics")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("analytics")}
      >
        <div className="absolute inset-0 rounded-2xl border border-sky-400/0 group-hover:border-sky-400/40 group-hover:bg-sky-500/[0.08] transition-all" />
        <span className="sr-only">ANALYTICS</span>
        {hoveredRoom === "analytics" && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-sky-400/40 bg-slate-950/90 px-2 py-0.5 text-[8px] font-mono font-bold text-sky-300 whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in">
            ANALYTICS
          </div>
        )}
      </div>

      {/* Ground Amenities */}
      {/* Gaming Room */}
      <div
        className="absolute left-[7%] top-[74%] h-[19%] w-[16%] cursor-pointer rounded-2xl group"
        aria-label="GAMING ROOM"
        title="GAMING ROOM"
        onMouseEnter={() => setHoveredRoom("gaming")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("gaming")}
      >
        <div className="absolute inset-0 rounded-2xl border border-purple-400/0 group-hover:border-purple-400/40 group-hover:bg-purple-500/[0.08] transition-all" />
        <span className="sr-only">GAMING ROOM</span>
      </div>

      {/* Kitchen & Break */}
      <div
        className="absolute left-[24%] top-[74%] h-[19%] w-[18%] cursor-pointer rounded-2xl group"
        aria-label="KITCHEN & BREAK"
        title="KITCHEN & BREAK"
        onMouseEnter={() => setHoveredRoom("kitchen")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("kitchen")}
      >
        <div className="absolute inset-0 rounded-2xl border border-emerald-400/0 group-hover:border-emerald-400/40 group-hover:bg-emerald-500/[0.08] transition-all" />
        <span className="sr-only">KITCHEN & BREAK</span>
      </div>

      {/* Relaxation Area */}
      <div
        className="absolute left-[52%] top-[74%] h-[19%] w-[15%] cursor-pointer rounded-2xl group"
        aria-label="RELAXATION AREA"
        title="RELAXATION AREA"
        onMouseEnter={() => setHoveredRoom("relaxation")}
        onMouseLeave={() => setHoveredRoom(null)}
        onClick={() => onSelectRoom?.("relaxation")}
      >
        <div className="absolute inset-0 rounded-2xl border border-amber-400/0 group-hover:border-amber-400/40 group-hover:bg-amber-500/[0.08] transition-all" />
        <span className="sr-only">RELAXATION AREA</span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. FOREGROUND GLOBAL IMPACT BALUSTRADE (Bottom Center)         */}
      {/* ------------------------------------------------------------- */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        {/* Subtle illuminated globe glow */}
        <div
          className="h-16 w-80 rounded-t-full opacity-40 mix-blend-screen"
          style={{
            background: "radial-gradient(ellipse at bottom, rgba(56, 189, 248, 0.4) 0%, transparent 70%)",
          }}
        />
        <div className="flex items-center gap-2 pb-1 text-[9px] font-mono tracking-widest text-cyan-300/90 font-semibold drop-shadow">
          <Globe2 className="h-3 w-3 text-cyan-400 animate-spin" style={{ animationDuration: "20s" }} />
          <span>A HEALTHIER PLANET • A BRIGHTER TOMORROW</span>
        </div>
      </div>
    </div>
  );
}
