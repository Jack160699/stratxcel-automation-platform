"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Target,
  Users,
  Briefcase,
  LineChart,
  BookOpen,
  Settings,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

interface OfficeNavRailProps {
  founderName?: string;
  isOnline?: boolean;
}

export function OfficeNavRail({
  founderName = "Founder",
  isOnline = true,
}: OfficeNavRailProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const NAV_ITEMS = [
    {
      key: "office",
      label: "Office",
      href: "/admin/office",
      icon: Building2,
      active: true,
    },
    {
      key: "missions",
      label: "Missions",
      href: "/admin/missions",
      icon: Target,
      active: pathname.startsWith("/admin/missions"),
    },
    {
      key: "employees",
      label: "Employees",
      href: "/admin/team",
      icon: Users,
      active: pathname.startsWith("/admin/team") || pathname.startsWith("/admin/employees"),
    },
    {
      key: "crm",
      label: "CRM",
      href: "/admin/leads",
      icon: Briefcase,
      active: pathname.startsWith("/admin/leads") || pathname.startsWith("/admin/crm"),
    },
    {
      key: "analytics",
      label: "Analytics",
      href: "/admin/analytics",
      icon: LineChart,
      active: pathname.startsWith("/admin/analytics"),
    },
    {
      key: "knowledge",
      label: "Knowledge",
      href: "/admin/knowledge",
      icon: BookOpen,
      active: pathname.startsWith("/admin/knowledge"),
    },
    {
      key: "settings",
      label: "Settings",
      href: "/admin/integrations",
      icon: Settings,
      active: pathname.startsWith("/admin/integrations") || pathname.startsWith("/admin/settings"),
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col justify-between border-r border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-2xl transition-all duration-300 select-none ${
        isCollapsed ? "w-14" : "w-16"
      }`}
      aria-label="StratXcel Executive Navigation"
    >
      {/* Top: Toggle Button & Logo Marker */}
      <div className="flex flex-col items-center pt-3 pb-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title={isCollapsed ? "Expand Navigation" : "Collapse Navigation"}
          aria-label={isCollapsed ? "Expand Navigation" : "Collapse Navigation"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center -space-x-1 font-mono text-[11px] font-bold text-slate-400 hover:text-white">
              <span>&gt;</span>
              <span>&gt;</span>
            </div>
          )}
        </button>
      </div>

      {/* Middle: Navigation Icons Stack */}
      <nav className="flex flex-1 flex-col items-center gap-2 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group relative flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${
                isCollapsed ? "h-11 w-11" : "h-12 w-12"
              } ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/40"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
              <span className="mt-1 text-[8px] font-medium tracking-tight leading-none">
                {item.label}
              </span>

              {/* Active subtle left indicator pip */}
              {isActive && (
                <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-4 w-1 rounded-r-full bg-cyan-300 shadow-sm" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Founder Profile Pill */}
      <div className="flex flex-col items-center pb-4 pt-2 border-t border-white/10">
        <div className="relative group flex flex-col items-center cursor-pointer">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-600 to-blue-700 p-0.5 shadow-lg ring-1 ring-white/20">
            <span className="text-[10px] font-bold text-white font-mono">SC</span>
            {isOnline && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
            )}
          </div>
          <span className="mt-1 text-[8px] font-mono text-slate-300 font-semibold group-hover:text-white transition-colors">
            {founderName}
          </span>
          <span className="text-[7px] font-mono text-emerald-400">Online</span>
        </div>
      </div>
    </aside>
  );
}
