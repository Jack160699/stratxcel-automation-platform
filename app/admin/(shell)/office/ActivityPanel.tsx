"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { LiveActivityItem, DepartmentKey, AgentState } from "./office-types";
import { DEPARTMENT_PALETTES } from "./office-types";
import {
  Activity,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Share2,
  Sparkles,
  FileText,
  Compass,
  Layers,
  X,
  GripVertical,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface ActivityPanelProps {
  activities: LiveActivityItem[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectWorkerKey?: (key: string) => void;
}

const STATUS_ICONS: Record<string, any> = {
  ANALYZING: Compass,
  PLANNING: Layers,
  SEARCHING: Search,
  WORKING: Play,
  DELEGATING: Share2,
  GENERATING: Sparkles,
  WAITING: Clock,
  BLOCKED: AlertCircle,
  COMPLETED: CheckCircle2,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  ANALYZING: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-300",
    border: "border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  PLANNING: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-300",
    border: "border-indigo-500/30",
    dot: "bg-indigo-400",
  },
  SEARCHING: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  WORKING: {
    bg: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
  },
  DELEGATING: {
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-500/30",
    dot: "bg-purple-400",
  },
  GENERATING: {
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  WAITING: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/30",
    dot: "bg-slate-400",
  },
  BLOCKED: {
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
  },
  COMPLETED: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

export function ActivityPanel({
  activities,
  isOpen,
  onToggle,
  onSelectWorkerKey,
}: ActivityPanelProps) {
  const [width, setWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "COMPLETED" | "BLOCKED">("ALL");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const resizeRef = useRef<HTMLDivElement>(null);

  // Drag-to-resize handle
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= 680) {
        setWidth(newWidth);
      }
    }

    function handleMouseUp() {
      setIsResizing(false);
    }

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Status category filter
      if (statusFilter === "ACTIVE") {
        if (act.state === "COMPLETED" || act.state === "BLOCKED") return false;
      } else if (statusFilter === "COMPLETED") {
        if (act.state !== "COMPLETED") return false;
      } else if (statusFilter === "BLOCKED") {
        if (act.state !== "BLOCKED") return false;
      }

      // Department filter
      if (deptFilter !== "ALL" && act.department !== deptFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesGoal = act.missionGoal?.toLowerCase().includes(q);
        const matchesWorker = act.workerName.toLowerCase().includes(q);
        const matchesStep = act.currentStep?.toLowerCase().includes(q);
        if (!matchesGoal && !matchesWorker && !matchesStep) return false;
      }

      return true;
    });
  }, [activities, statusFilter, deptFilter, searchQuery]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed top-14 right-4 z-40 flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/85 px-3.5 py-2 shadow-2xl backdrop-blur-xl transition-all hover:bg-slate-900 hover:border-cyan-400/40 text-slate-200"
        title="Open Live Execution Panel"
      >
        <Activity className="h-4 w-4 text-cyan-400 animate-pulse" />
        <span className="font-mono text-xs font-bold tracking-wider">EXECUTION</span>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-mono font-bold text-cyan-300">
          {activities.filter((a) => a.state !== "COMPLETED").length}
        </span>
        <ChevronLeft className="h-4 w-4 text-slate-400" />
      </button>
    );
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-2xl text-slate-200 select-none transition-[width] duration-75"
    >
      {/* 1. Drag Resize Handle on Left Edge */}
      <div
        ref={resizeRef}
        onMouseDown={() => setIsResizing(true)}
        className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group hover:bg-cyan-500/10 transition-colors"
        title="Drag to resize panel"
      >
        <div className="h-8 w-1 rounded-full bg-white/20 group-hover:bg-cyan-400 transition-colors" />
      </div>

      {/* 2. Panel Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-500/10 shadow-inner">
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-white">
                Live Execution Panel
              </h2>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <p className="font-mono text-[9px] text-slate-400">
              HARNESS AGENT OBSERVABILITY
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Collapse Panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="flex flex-col gap-2 border-b border-white/10 p-3 bg-slate-900/40">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter step, mission or agent..."
            className="w-full rounded-lg border border-white/10 bg-black/40 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-slate-500 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Status Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-mono">
          {(["ALL", "ACTIVE", "COMPLETED", "BLOCKED"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-2 py-1 font-bold transition-all shrink-0 ${
                statusFilter === st
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-transparent"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Live Activities Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Clock className="h-8 w-8 text-slate-600 mb-2" />
            <span className="text-xs font-medium text-slate-400">No matching activities</span>
            <span className="text-[10px] text-slate-600 mt-0.5">
              Submit a business objective in the Command Dock to launch workforce missions.
            </span>
          </div>
        ) : (
          filteredActivities.map((act) => {
            const Icon = STATUS_ICONS[act.state] || Activity;
            const colors = STATUS_COLORS[act.state] || STATUS_COLORS.WORKING;
            const deptPalette = DEPARTMENT_PALETTES[act.department] || DEPARTMENT_PALETTES.operations;

            return (
              <div
                key={act.id}
                onClick={() => onSelectWorkerKey?.(act.workerKey)}
                className="group relative flex flex-col rounded-xl border border-white/10 bg-slate-900/70 p-3 shadow-lg hover:border-white/20 hover:bg-slate-900 transition-all cursor-pointer"
              >
                {/* Top Row: Worker Name + Status Pill + Elapsed Time */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: deptPalette.accent }}
                    />
                    <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">
                      {act.workerName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      · {act.departmentLabel}
                    </span>
                  </div>

                  <span
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-mono font-bold border ${colors.bg} ${colors.text} ${colors.border}`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    <span>{act.state}</span>
                  </span>
                </div>

                {/* Mission Goal */}
                {act.missionGoal && (
                  <p className="mt-1.5 text-xs text-slate-200 leading-snug font-medium line-clamp-2">
                    {act.missionGoal}
                  </p>
                )}

                {/* Current Step / Execution Trace */}
                <div className="mt-2 flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1.5 text-[10px] font-mono text-slate-300">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} animate-pulse`} />
                    <span className="truncate text-slate-300">
                      Step: {act.currentStep || "executing"}
                    </span>
                  </div>

                  <span className="text-slate-500 shrink-0 ml-2">
                    {act.elapsedTime}
                  </span>
                </div>

                {/* Latest Event & Artifact (if present) */}
                {act.artifactLabel && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono">
                    <FileText className="h-3 w-3" />
                    <span className="truncate">Deliverable: {act.artifactLabel}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Panel Footer with Summary Count */}
      <div className="border-t border-white/10 px-4 py-2.5 bg-slate-900/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>{filteredActivities.length} visible operations</span>
        <span className="text-emerald-400 font-bold">TELEMETRY LIVE</span>
      </div>
    </aside>
  );
}
