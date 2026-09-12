"use client";

import { useState } from "react";
import {
  MANDATORY_OFFICE_ZONES,
  type ZoneKey,
  GRID_COLS,
  GRID_ROWS,
} from "@/lib/office/pixel-pathfinding";
import {
  Sparkles,
  Users,
  Coffee,
  Gamepad2,
  Database,
  Code2,
  TrendingUp,
  Search,
  CheckCircle2,
  Briefcase,
  Monitor,
  FolderOpen,
} from "lucide-react";

interface PixelOfficeEnvironmentProps {
  hermesObjective?: string;
  isMeetingActive?: boolean;
  activeCount?: number;
  meetingTopic?: string;
  onSelectZone?: (zoneKey: ZoneKey) => void;
}

export function PixelOfficeEnvironment({
  hermesObjective = "Aligning autonomous workforce execution",
  isMeetingActive = true,
  activeCount = 7,
  meetingTopic = "Autonomous Lead Discovery & Pipeline Conversion",
  onSelectZone,
}: PixelOfficeEnvironmentProps) {
  const [hoveredZone, setHoveredZone] = useState<ZoneKey | null>(null);

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden select-none bg-[#110f19]">
      {/* ------------------------------------------------------------- */}
      {/* 1. WARM WOOD PLANK FLOOR WITH PIXEL SEAMS (MATCHING REF)       */}
      {/* ------------------------------------------------------------- */}
      <div
        className="absolute inset-0 h-full w-full opacity-90"
        style={{
          backgroundColor: "#b47a46",
          backgroundImage: `
            linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px),
            linear-gradient(0deg, rgba(0,0,0,0.12) 2px, transparent 2px),
            linear-gradient(rgba(196, 137, 85, 0.4) 0%, rgba(148, 93, 47, 0.6) 100%)
          `,
          backgroundSize: "64px 32px, 64px 32px, 100% 100%",
        }}
      />

      {/* Atmospheric Pixel Vignette */}
      <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/60 pointer-events-none" />

      {/* ------------------------------------------------------------- */}
      {/* 2. ZONE PERIMETERS & FLOOR IDENTIFIERS (14 MANDATORY ZONES)   */}
      {/* ------------------------------------------------------------- */}

      {/* ZONE 1: EXECUTIVE SUITE (HERMES CEO) - Top Center */}
      <div
        className={`absolute left-[38%] top-[2%] w-[24%] h-[20%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "EXECUTIVE_SUITE"
            ? "border-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/20"
            : "border-cyan-500/40 bg-cyan-950/20"
        }`}
        onClick={() => onSelectZone?.("EXECUTIVE_SUITE")}
        onMouseEnter={() => setHoveredZone("EXECUTIVE_SUITE")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-cyan-500/60 px-2 py-0.5 text-[10px] font-bold text-cyan-300 shadow">
          <Briefcase size={11} />
          <span>EXECUTIVE SUITE • HERMES CEO</span>
        </div>
        {/* CEO Dais & Executive Mahogany Desk */}
        <div className="absolute left-[30%] top-[40%] w-[40%] h-[35%] rounded bg-[#5a2e16] border-2 border-[#381a0b] shadow-md flex items-center justify-center">
          <div className="flex gap-2">
            {/* Dual Ultra-wide Monitors */}
            <div className="w-6 h-4 rounded-xs bg-[#0c1322] border border-cyan-400/80 flex items-center justify-center">
              <span className="text-[7px] text-cyan-300 font-mono">HQ</span>
            </div>
            <div className="w-6 h-4 rounded-xs bg-[#0c1322] border border-cyan-400/80 flex items-center justify-center">
              <span className="text-[7px] text-emerald-300 font-mono">₹</span>
            </div>
          </div>
        </div>
      </div>

      {/* ZONE 2: RESEARCH POD - Left Level 1 */}
      <div
        className={`absolute left-[3%] top-[5%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "RESEARCH_POD"
            ? "border-sky-400 bg-sky-950/40 shadow-lg shadow-sky-500/20"
            : "border-sky-500/40 bg-sky-950/20"
        }`}
        onClick={() => onSelectZone?.("RESEARCH_POD")}
        onMouseEnter={() => setHoveredZone("RESEARCH_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-sky-500/60 px-2 py-0.5 text-[10px] font-bold text-sky-300 shadow">
          <Search size={11} />
          <span>RESEARCH & PLACES • MAYA</span>
        </div>
        {/* Workstation Desk with Blue Partition */}
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#1e3a8a] border-t border-sky-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-sky-400 flex items-center justify-center text-[6px] text-sky-300 font-mono">MAP</div>
            <div className="w-5 h-4 bg-black border border-sky-400 flex items-center justify-center text-[6px] text-emerald-300 font-mono">LEAD</div>
          </div>
        </div>
      </div>

      {/* ZONE 3: SALES POD - Left Level 2 */}
      <div
        className={`absolute left-[3%] top-[32%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "SALES_POD"
            ? "border-rose-400 bg-rose-950/40 shadow-lg shadow-rose-500/20"
            : "border-rose-500/40 bg-rose-950/20"
        }`}
        onClick={() => onSelectZone?.("SALES_POD")}
        onMouseEnter={() => setHoveredZone("SALES_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-rose-500/60 px-2 py-0.5 text-[10px] font-bold text-rose-300 shadow">
          <TrendingUp size={11} />
          <span>SALES & OUTREACH • LIAM</span>
        </div>
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#881337] border-t border-rose-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-rose-400 flex items-center justify-center text-[6px] text-rose-300 font-mono">WA</div>
            <div className="w-5 h-4 bg-black border border-rose-400 flex items-center justify-center text-[6px] text-zinc-300 font-mono">MAIL</div>
          </div>
        </div>
      </div>

      {/* ZONE 4: MARKETING / CONTENT - Left Level 3 */}
      <div
        className={`absolute left-[3%] top-[59%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "MARKETING_POD"
            ? "border-purple-400 bg-purple-950/40 shadow-lg shadow-purple-500/20"
            : "border-purple-500/40 bg-purple-950/20"
        }`}
        onClick={() => onSelectZone?.("MARKETING_POD")}
        onMouseEnter={() => setHoveredZone("MARKETING_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-purple-500/60 px-2 py-0.5 text-[10px] font-bold text-purple-300 shadow">
          <Sparkles size={11} />
          <span>MARKETING & CREATIVE • CALLIOPE</span>
        </div>
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#581c87] border-t border-purple-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-purple-400 flex items-center justify-center text-[6px] text-purple-300 font-mono">POST</div>
            <div className="w-5 h-4 bg-black border border-purple-400 flex items-center justify-center text-[6px] text-pink-300 font-mono">IMG</div>
          </div>
        </div>
      </div>

      {/* ZONE 5: SEO DEPARTMENT - Center Left */}
      <div
        className={`absolute left-[27%] top-[32%] w-[10%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "SEO_POD"
            ? "border-emerald-400 bg-emerald-950/40 shadow-lg shadow-emerald-500/20"
            : "border-emerald-500/40 bg-emerald-950/20"
        }`}
        onClick={() => onSelectZone?.("SEO_POD")}
        onMouseEnter={() => setHoveredZone("SEO_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-2 flex items-center gap-1 rounded bg-zinc-900 border border-emerald-500/60 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 shadow">
          <span>SEO & GA4</span>
        </div>
        <div className="absolute left-[15%] top-[35%] w-[70%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md flex items-center justify-center">
          <div className="w-5 h-4 bg-black border border-emerald-400 flex items-center justify-center text-[6px] text-emerald-300 font-mono">GSC</div>
        </div>
      </div>

      {/* ZONE 6: ENGINEERING POD - Right Level 1 */}
      <div
        className={`absolute right-[3%] top-[5%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "ENGINEERING_POD"
            ? "border-blue-400 bg-blue-950/40 shadow-lg shadow-blue-500/20"
            : "border-blue-500/40 bg-blue-950/20"
        }`}
        onClick={() => onSelectZone?.("ENGINEERING_POD")}
        onMouseEnter={() => setHoveredZone("ENGINEERING_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-blue-500/60 px-2 py-0.5 text-[10px] font-bold text-blue-300 shadow">
          <Code2 size={11} />
          <span>ENGINEERING & REPAIR • VULCAN</span>
        </div>
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#1e3a8a] border-t border-blue-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-blue-400 flex items-center justify-center text-[6px] text-blue-300 font-mono">&lt;/&gt;</div>
            <div className="w-5 h-4 bg-black border border-blue-400 flex items-center justify-center text-[6px] text-green-400 font-mono">EC2</div>
          </div>
        </div>
      </div>

      {/* ZONE 7: FINANCE DEPARTMENT - Right Level 2 */}
      <div
        className={`absolute right-[3%] top-[32%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "FINANCE_POD"
            ? "border-amber-400 bg-amber-950/40 shadow-lg shadow-amber-500/20"
            : "border-amber-500/40 bg-amber-950/20"
        }`}
        onClick={() => onSelectZone?.("FINANCE_POD")}
        onMouseEnter={() => setHoveredZone("FINANCE_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-amber-500/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 shadow">
          <TrendingUp size={11} />
          <span>FINANCE & REVENUE • ALEX</span>
        </div>
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#78350f] border-t border-amber-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-amber-400 flex items-center justify-center text-[6px] text-amber-300 font-mono">INV</div>
            <div className="w-5 h-4 bg-black border border-amber-400 flex items-center justify-center text-[6px] text-emerald-400 font-mono">RZP</div>
          </div>
        </div>
      </div>

      {/* ZONE 8: OPERATIONS POD - Right Level 3 */}
      <div
        className={`absolute right-[3%] top-[59%] w-[22%] h-[23%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "OPERATIONS_POD"
            ? "border-teal-400 bg-teal-950/40 shadow-lg shadow-teal-500/20"
            : "border-teal-500/40 bg-teal-950/20"
        }`}
        onClick={() => onSelectZone?.("OPERATIONS_POD")}
        onMouseEnter={() => setHoveredZone("OPERATIONS_POD")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-teal-500/60 px-2 py-0.5 text-[10px] font-bold text-teal-300 shadow">
          <CheckCircle2 size={11} />
          <span>OPERATIONS & QUEUE • OPS</span>
        </div>
        <div className="absolute left-[20%] top-[35%] w-[60%] h-[40%] rounded bg-[#6d3e1d] border-2 border-[#42210c] shadow-md">
          <div className="absolute -top-3 left-0 right-0 h-3 rounded-t bg-[#134e4a] border-t border-teal-400/50" />
          <div className="flex items-center justify-center h-full gap-2 pt-1">
            <div className="w-5 h-4 bg-black border border-teal-400 flex items-center justify-center text-[6px] text-teal-300 font-mono">Q</div>
            <div className="w-5 h-4 bg-black border border-teal-400 flex items-center justify-center text-[6px] text-yellow-300 font-mono">DONE</div>
          </div>
        </div>
      </div>

      {/* ZONE 9: CENTRAL MEETING ROOM (MATCHING REF) */}
      <div
        className={`absolute left-[39%] top-[27%] w-[22%] h-[26%] rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "MEETING_ROOM"
            ? "border-indigo-400 bg-indigo-950/50 shadow-xl shadow-indigo-500/20"
            : "border-indigo-500/40 bg-indigo-950/30"
        }`}
        onClick={() => onSelectZone?.("MEETING_ROOM")}
        onMouseEnter={() => setHoveredZone("MEETING_ROOM")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 rounded bg-zinc-900 border border-indigo-500/60 px-2 py-0.5 text-[10px] font-bold text-indigo-300 shadow">
          <Users size={11} />
          <span>CENTRAL STRATEGY MEETING ROOM</span>
        </div>
        {/* Conference Table */}
        <div className="absolute left-[20%] top-[25%] w-[60%] h-[50%] rounded-xl bg-[#522b14] border-2 border-[#331608] shadow-inner flex items-center justify-center">
          <div className="w-16 h-8 rounded bg-[#1e1b4b] border border-indigo-400/60 flex items-center justify-center text-[8px] text-indigo-200 font-mono text-center px-1">
            {meetingTopic.slice(0, 18)}…
          </div>
        </div>
      </div>

      {/* ZONE 10: COFFEE LOUNGE - Bottom Left */}
      <div
        className={`absolute left-[3%] bottom-[2%] w-[18%] h-[12%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "COFFEE_LOUNGE"
            ? "border-amber-400 bg-amber-950/40"
            : "border-amber-500/40 bg-amber-950/20"
        }`}
        onClick={() => onSelectZone?.("COFFEE_LOUNGE")}
        onMouseEnter={() => setHoveredZone("COFFEE_LOUNGE")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-3 flex items-center gap-1 rounded bg-zinc-900 border border-amber-500/60 px-2 py-0.5 text-[9px] font-bold text-amber-300">
          <Coffee size={10} />
          <span>COFFEE LOUNGE</span>
        </div>
        {/* Espresso Bar */}
        <div className="absolute left-[25%] top-[30%] w-[50%] h-[40%] rounded bg-[#451a03] border border-amber-700/80 flex items-center justify-center gap-2">
          <span className="text-[12px]">☕</span>
          <div className="w-4 h-3 bg-zinc-800 rounded-xs border border-zinc-600" />
        </div>
      </div>

      {/* ZONE 11: GAMING & RECREATION - Bottom Center-Left */}
      <div
        className={`absolute left-[23%] bottom-[2%] w-[18%] h-[12%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "GAMING_ROOM"
            ? "border-pink-400 bg-pink-950/40"
            : "border-pink-500/40 bg-pink-950/20"
        }`}
        onClick={() => onSelectZone?.("GAMING_ROOM")}
        onMouseEnter={() => setHoveredZone("GAMING_ROOM")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-3 flex items-center gap-1 rounded bg-zinc-900 border border-pink-500/60 px-2 py-0.5 text-[9px] font-bold text-pink-300">
          <Gamepad2 size={10} />
          <span>RECREATION / ARCADE</span>
        </div>
        {/* Pixel Arcade Cabinets */}
        <div className="absolute left-[20%] top-[25%] flex gap-2">
          <div className="w-5 h-8 bg-purple-900 rounded-xs border border-pink-400 flex items-center justify-center text-[7px] text-pink-300 font-mono">👾</div>
          <div className="w-5 h-8 bg-blue-900 rounded-xs border border-cyan-400 flex items-center justify-center text-[7px] text-cyan-300 font-mono">🕹</div>
        </div>
      </div>

      {/* ZONE 12: FILE / DATA ROOM (MEMORY BOT PERSISTENCE) - Bottom Center-Right */}
      <div
        className={`absolute right-[23%] bottom-[2%] w-[18%] h-[12%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "FILE_DATA_ROOM"
            ? "border-violet-400 bg-violet-950/40"
            : "border-violet-500/40 bg-violet-950/20"
        }`}
        onClick={() => onSelectZone?.("FILE_DATA_ROOM")}
        onMouseEnter={() => setHoveredZone("FILE_DATA_ROOM")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-3 flex items-center gap-1 rounded bg-zinc-900 border border-violet-500/60 px-2 py-0.5 text-[9px] font-bold text-violet-300">
          <Database size={10} />
          <span>DATA ROOM • MEMORY & PERSISTENCE</span>
        </div>
        {/* Memory Server & Storage Disks */}
        <div className="absolute left-[25%] top-[25%] flex items-center gap-3">
          <div className="w-7 h-8 bg-zinc-900 rounded-xs border border-violet-400 flex flex-col items-center justify-around py-0.5">
            <span className="h-1 w-5 bg-violet-400/80 rounded-full" />
            <span className="h-1 w-5 bg-violet-400/80 rounded-full" />
            <span className="h-1 w-5 bg-emerald-400/80 rounded-full animate-pulse" />
          </div>
          <div className="text-[10px]">🤖</div>
        </div>
      </div>

      {/* ZONE 13: COLLABORATION AREA - Center Lower */}
      <div
        className={`absolute left-[42%] top-[56%] w-[16%] h-[20%] rounded-xl border-2 transition-all duration-300 cursor-pointer ${
          hoveredZone === "COLLABORATION_AREA"
            ? "border-emerald-400 bg-emerald-950/40"
            : "border-emerald-500/40 bg-emerald-950/20"
        }`}
        onClick={() => onSelectZone?.("COLLABORATION_AREA")}
        onMouseEnter={() => setHoveredZone("COLLABORATION_AREA")}
        onMouseLeave={() => setHoveredZone(null)}
      >
        <div className="absolute -top-3 left-2 flex items-center gap-1 rounded bg-zinc-900 border border-emerald-500/60 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
          <span>COLLABORATION WHITEBOARD</span>
        </div>
        {/* Whiteboard */}
        <div className="absolute left-[15%] top-[30%] w-[70%] h-[45%] rounded bg-zinc-100 border-2 border-zinc-400 shadow-sm p-1">
          <div className="w-full h-1 bg-cyan-500 rounded-full mb-1" />
          <div className="w-3/4 h-1 bg-rose-500 rounded-full mb-1" />
          <div className="w-1/2 h-1 bg-emerald-500 rounded-full" />
        </div>
      </div>

      {/* Potted Pixel Plants in Corridors */}
      <div className="absolute left-[26%] top-[10%] text-[14px]">🪴</div>
      <div className="absolute right-[26%] top-[10%] text-[14px]">🪴</div>
      <div className="absolute left-[38%] bottom-[16%] text-[14px]">🪴</div>
      <div className="absolute right-[38%] bottom-[16%] text-[14px]">🪴</div>
    </div>
  );
}
