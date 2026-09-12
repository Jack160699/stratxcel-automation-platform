"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { LiveActivityItem, DepartmentKey, AgentState } from "./office-types";
import { DEPARTMENT_PALETTES } from "./office-types";
import {
  Activity,
  X,
  ArrowRight,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Compass,
  Play,
  Share2,
  AlertCircle,
  Users,
} from "lucide-react";
import Link from "next/link";

interface ActivityPanelProps {
  activities: LiveActivityItem[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectWorkerKey?: (key: string) => void;
}

interface DisplayActivityItem {
  id: string;
  workerKey: string;
  workerName: string;
  roleLabel: string;
  department: DepartmentKey | string;
  state: AgentState | string;
  statusText: string;
  statusType: string;
  subtitle: string;
  timeAgo: string;
  avatarColor: string;
  initials: string;
}

// Canonical autonomous workforce roster matching Founder reference
const DEFAULT_SAMPLE_ACTIVITIES: DisplayActivityItem[] = [
  {
    id: "act-1",
    workerKey: "hermes",
    workerName: "Hermes",
    roleLabel: "Hermes (CEO)",
    department: "executive",
    state: "PLANNING",
    statusText: "Planning",
    statusType: "dot-emerald",
    subtitle: "Solar leads strategy",
    timeAgo: "2m ago",
    avatarColor: "#06b6d4",
    initials: "H",
  },
  {
    id: "act-2",
    workerKey: "research_agent",
    workerName: "Athena",
    roleLabel: "Research Agent",
    department: "research" as const,
    state: "SEARCHING" as const,
    statusText: "Searching",
    statusType: "diamond-amber",
    subtitle: "Finding solar installers (India)",
    timeAgo: "4m ago",
    avatarColor: "#f59e0b",
    initials: "R",
  },
  {
    id: "act-3",
    workerKey: "sales_agent",
    workerName: "Mercury",
    roleLabel: "Sales Agent",
    department: "sales" as const,
    state: "WORKING" as const,
    statusText: "Qualifying",
    statusType: "dot-emerald",
    subtitle: "Reviewing 53 new leads",
    timeAgo: "6m ago",
    avatarColor: "#10b981",
    initials: "S",
  },
  {
    id: "act-4",
    workerKey: "content_agent",
    workerName: "Calliope",
    roleLabel: "Marketing Agent",
    department: "marketing" as const,
    state: "GENERATING" as const,
    statusText: "Generating",
    statusType: "dot-amber",
    subtitle: "Creating LinkedIn campaign",
    timeAgo: "8m ago",
    avatarColor: "#ec4899",
    initials: "M",
  },
  {
    id: "act-5",
    workerKey: "finance_agent",
    workerName: "Plutus",
    roleLabel: "Finance Agent",
    department: "finance" as const,
    state: "ANALYZING" as const,
    statusText: "Analyzing",
    statusType: "dot-cyan",
    subtitle: "Revenue projections",
    timeAgo: "10m ago",
    avatarColor: "#14b8a6",
    initials: "F",
  },
  {
    id: "act-6",
    workerKey: "operations_agent",
    workerName: "Atlas",
    roleLabel: "Operations Agent",
    department: "operations" as const,
    state: "WORKING" as const,
    statusText: "Preparing",
    statusType: "dot-sky",
    subtitle: "Onboarding workflow",
    timeAgo: "12m ago",
    avatarColor: "#0284c7",
    initials: "O",
  },
  {
    id: "act-7",
    workerKey: "engineering_agent",
    workerName: "Vulcan",
    roleLabel: "Engineering Agent",
    department: "engineering" as const,
    state: "WORKING" as const,
    statusText: "Building",
    statusType: "dot-cyan",
    subtitle: "New scraping capability",
    timeAgo: "15m ago",
    avatarColor: "#3b82f6",
    initials: "E",
  },
  {
    id: "act-8",
    workerKey: "people_agent",
    workerName: "Hestia",
    roleLabel: "HR Agent",
    department: "people" as const,
    state: "WAITING" as const,
    statusText: "Idle",
    statusType: "dot-slate",
    subtitle: "In Coffee Lounge",
    timeAgo: "18m ago",
    avatarColor: "#8b5cf6",
    initials: "H",
  },
  {
    id: "act-9",
    workerKey: "design_agent",
    workerName: "Calliope",
    roleLabel: "Content Agent",
    department: "marketing" as const,
    state: "GENERATING" as const,
    statusText: "Creating",
    statusType: "dot-emerald",
    subtitle: "Blog on MBBS in Russia",
    timeAgo: "20m ago",
    avatarColor: "#f43f5e",
    initials: "C",
  },
  {
    id: "act-10",
    workerKey: "crm_agent",
    workerName: "Iris",
    roleLabel: "CRM Agent",
    department: "crm" as const,
    state: "WORKING" as const,
    statusText: "Updating",
    statusType: "dot-emerald",
    subtitle: "Syncing 120 leads",
    timeAgo: "22m ago",
    avatarColor: "#a855f7",
    initials: "C",
  },
];

export function ActivityPanel({
  activities,
  isOpen,
  onToggle,
  onSelectWorkerKey,
}: ActivityPanelProps) {
  const [width, setWidth] = useState<number>(330);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"All" | "Active" | "By Department">("All");

  const resizeRef = useRef<HTMLDivElement>(null);

  // Drag-to-resize handle
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= 520) {
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

  // Combine real live activities with reference workforce items
  const displayItems = useMemo(() => {
    // Deduplicate activities by workerKey so each agent appears once with their latest mission
    const seenWorkers = new Set<string>();
    const liveMapped: DisplayActivityItem[] = [];

    for (const act of activities) {
      if (seenWorkers.has(act.workerKey)) continue;
      seenWorkers.add(act.workerKey);

      const isHermes = act.workerKey === "hermes";
      let cleanSubtitle = act.missionGoal || act.currentStep || "Executing mission task";
      if (cleanSubtitle.toLowerCase().includes("executive multi-objective:")) {
        cleanSubtitle = cleanSubtitle.replace(/executive multi-objective:\s*/i, "");
      }
      if (cleanSubtitle.length > 34) {
        cleanSubtitle = cleanSubtitle.slice(0, 32) + "...";
      }

      const roleLabel = isHermes
        ? "Hermes (CEO)"
        : act.department === "research"
        ? "Research Agent"
        : act.department === "sales"
        ? "Sales Agent"
        : act.department === "marketing" || act.department === "content"
        ? "Marketing Agent"
        : act.department === "finance"
        ? "Finance Agent"
        : act.department === "operations"
        ? "Operations Agent"
        : act.department === "engineering" || act.department === "website"
        ? "Engineering Agent"
        : act.department === "people"
        ? "HR Agent"
        : act.department === "crm"
        ? "CRM Agent"
        : `${act.workerName} (${act.department})`;

      liveMapped.push({
        id: act.id || `live-${act.workerKey}`,
        workerKey: act.workerKey,
        workerName: act.workerName,
        roleLabel,
        department: act.department,
        state: act.state,
        statusText:
          act.state === "PLANNING"
            ? "Planning"
            : act.state === "SEARCHING"
            ? "Searching"
            : act.state === "ANALYZING"
            ? "Analyzing"
            : act.state === "GENERATING"
            ? "Generating"
            : "Working",
        statusType:
          act.state === "SEARCHING"
            ? "diamond-amber"
            : act.state === "ANALYZING"
            ? "dot-cyan"
            : act.state === "GENERATING"
            ? "dot-amber"
            : "dot-emerald",
        subtitle: cleanSubtitle,
        timeAgo: act.elapsedTime || "2m ago",
        avatarColor: DEPARTMENT_PALETTES[act.department]?.accent || "#06b6d4",
        initials: act.workerName.slice(0, 1).toUpperCase(),
      });
    }

    const combined = [...liveMapped];
    // Fill remaining departments from canonical reference workforce
    for (const def of DEFAULT_SAMPLE_ACTIVITIES) {
      if (!combined.some((c) => c.roleLabel === def.roleLabel)) {
        combined.push(def);
      }
    }

    // Filter by tab
    if (activeTab === "Active") {
      return combined.filter((i) => i.statusText !== "Idle" && i.state !== "WAITING");
    }
    if (activeTab === "By Department") {
      return [...combined].sort((a, b) => a.department.localeCompare(b.department));
    }
    return combined;
  }, [activities, activeTab]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-2xl text-slate-200 select-none transition-[width] duration-75"
    >
      {/* 1. Drag Resize Handle on Left Edge */}
      <div
        ref={resizeRef}
        onMouseDown={() => setIsResizing(true)}
        className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group hover:bg-cyan-500/10 transition-colors z-10"
        title="Drag to resize panel"
      >
        <div className="h-8 w-1 rounded-full bg-white/20 group-hover:bg-cyan-400 transition-colors" />
      </div>

      {/* 2. Panel Header matching Reference */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
        <h2 className="text-sm font-bold text-white tracking-wide">
          Live Activity
        </h2>

        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Close Live Activity"
          aria-label="Close Live Activity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 3. Filter Tabs matching Reference (All | Active | By Department) */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-white/10">
        {(["All", "Active", "By Department"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* 4. Live Activities Feed matching Reference */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
        {displayItems.map((act) => {
          return (
            <div
              key={act.id}
              onClick={() => onSelectWorkerKey?.(act.workerKey)}
              className="group flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              {/* Left: Avatar + Details */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Avatar circle with initials or icon */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-1 ring-white/20"
                  style={{
                    background: `linear-gradient(135deg, ${act.avatarColor}dd, ${act.avatarColor}55)`,
                  }}
                >
                  {act.initials}
                </div>

                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[12px] font-semibold text-white truncate group-hover:text-cyan-300 transition-colors">
                    {act.roleLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate leading-tight">
                    {act.subtitle}
                  </span>
                </div>
              </div>

              {/* Right: Status Pill & Time */}
              <div className="flex flex-col items-end shrink-0 pl-1">
                <div className="flex items-center gap-1">
                  {act.statusType === "diamond-amber" ? (
                    <span className="text-[9px] text-amber-400">◆</span>
                  ) : act.statusType === "dot-cyan" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  ) : act.statusType === "dot-amber" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  ) : act.statusType === "dot-sky" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  ) : act.statusType === "dot-slate" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                  <span
                    className={`text-[11px] font-medium leading-none ${
                      act.statusType === "diamond-amber" || act.statusType === "dot-amber"
                        ? "text-amber-400"
                        : act.statusType === "dot-cyan"
                        ? "text-cyan-400"
                        : act.statusType === "dot-sky"
                        ? "text-sky-400"
                        : act.statusType === "dot-slate"
                        ? "text-slate-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {act.statusText}
                  </span>
                </div>

                <span className="text-[9px] font-mono text-slate-500 mt-0.5">
                  {act.timeAgo}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Panel Footer: View All Activities Link */}
      <div className="p-3 border-t border-white/10 bg-slate-950/90 flex items-center justify-center">
        <Link
          href="/admin/missions"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-medium transition-colors"
        >
          <span>View All Activities</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
