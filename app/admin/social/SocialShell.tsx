"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/app/components/Mark";
import { SOCIAL_NAV, SOCIAL_UTILITY_NAV, type SocialNavItem } from "./nav";
import { useCopilot, sessionStatusLabel } from "./copilot/CopilotContext";
import { CopilotDockPanel } from "./copilot/CopilotDockPanel";
import { MinimizedButton } from "./copilot/MinimizedButton";

const ICON_PATHS: Record<SocialNavItem["icon"], string[]> = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10v10h13V10", "M9 20v-6h6v6"],
  copilot: ["M12 3v3", "M4.2 7.2l2.1 2.1", "M19.8 7.2l-2.1 2.1", "M5 14a7 7 0 0 1 14 0v5H5z", "M9 15h.01", "M15 15h.01"],
  create: ["M12 5v14", "M5 12h14", "M4 4h16v16H4z"],
  planner: ["M5 3v3", "M19 3v3", "M4 8h16", "M5 5h14v15H5z", "M8 12h3", "M13 12h3", "M8 16h3"],
  inbox: ["M4 5h16v14H4z", "M4 14h4l2 3h4l2-3h4"],
  analytics: ["M5 20V10", "M12 20V4", "M19 20v-7", "M3 20h18"],
  automations: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M6.3 6.3l2.8 2.8", "M14.9 14.9l2.8 2.8", "M17.7 6.3l-2.8 2.8", "M9.1 14.9l-2.8 2.8", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  brand: ["M12 3 4 7v6c0 4.5 3.2 7 8 8s8-2.5 8-8V7z", "M8 12h8", "M12 8v8"],
  integrations: ["M8 3v5", "M16 3v5", "M5 8h14v3a7 7 0 0 1-14 0z", "M12 18v3"],
  system: ["M12 3 14 6.2l3.7-.2.3 3.7L21 12l-3 2.3-.3 3.7-3.7-.2L12 21l-2-3.2-3.7.2-.3-3.7L3 12l3-2.3.3-3.7 3.7.2z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  settings: ["M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", "M14 4v6", "M6 14v6"],
};

function NavIcon({ name }: { name: SocialNavItem["icon"] }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function NavStatusDot({ expanded }: { expanded: boolean }) {
  const { sessionStatus } = useCopilot();
  const { label, tone } = sessionStatusLabel(sessionStatus);
  if (tone === "idle") return null;
  const color = tone === "working" ? "var(--saut-ai)" : tone === "waiting" ? "var(--saut-warning)" : "var(--saut-danger)";
  return (
    <span className={`ml-auto flex items-center gap-1.5 transition-opacity ${expanded ? "opacity-100" : "opacity-0"}`} title={label}>
      <span className={`h-[6px] w-[6px] rounded-full ${tone === "working" ? "saut-pulse" : ""}`} style={{ background: color }} aria-hidden />
      <span className="saut-mono text-[9.5px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </span>
  );
}

function NavLink({ item, expanded, onNavigate }: { item: SocialNavItem; expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.href === "/admin/social" ? pathname === item.href : pathname.startsWith(item.href);
  const isCopilot = item.href === "/admin/social/copilot";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={item.label}
      title={expanded ? undefined : item.label}
      className="flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm transition"
      style={active
        ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)", boxShadow: "inset 2px 0 0 var(--saut-accent)" }
        : { color: "var(--saut-text-muted)" }}
    >
      <NavIcon name={item.icon} />
      <span className={`min-w-0 flex-1 truncate transition-opacity ${expanded ? "opacity-100" : "pointer-events-none opacity-0"}`}>{item.label}</span>
      {isCopilot && <NavStatusDot expanded={expanded} />}
    </Link>
  );
}

export default function SocialShell({
  email,
  shadowMode,
  children,
}: {
  email: string;
  shadowMode: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  const [sidebarFocus, setSidebarFocus] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const { panelMode, isFullPage } = useCopilot();
  const showDock = panelMode === "docked" && !isFullPage;
  const showMinimized = panelMode === "minimized" && !isFullPage;
  const sidebarExpanded = sidebarPinned || sidebarHover || sidebarFocus;

  useEffect(() => {
    const restorePreference = window.setTimeout(() => {
      setSidebarPinned(window.localStorage.getItem("saut:shell:sidebar-pinned") === "true");
    }, 0);
    document.documentElement.classList.add("saut-document-lock");
    document.body.classList.add("saut-document-lock");
    return () => {
      window.clearTimeout(restorePreference);
      document.documentElement.classList.remove("saut-document-lock");
      document.body.classList.remove("saut-document-lock");
    };
  }, []);

  const togglePinned = () => {
    setSidebarPinned((current) => {
      const next = !current;
      window.localStorage.setItem("saut:shell:sidebar-pinned", String(next));
      return next;
    });
  };

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden">
      <div className={`relative z-30 hidden shrink-0 lg:block ${sidebarPinned ? "w-[240px]" : "w-16"}`}>
        <nav
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          onFocusCapture={() => setSidebarFocus(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSidebarFocus(false);
          }}
          className={`absolute inset-y-0 left-0 flex flex-col gap-1 overflow-hidden border-r p-3 shadow-2xl transition-[width] duration-150 ${sidebarExpanded ? "w-[240px]" : "w-16"}`}
          style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}
          aria-label="Social Autopilot navigation"
        >
          <div className="flex h-10 items-center gap-3 px-[7px]">
            <Mark className="h-6 w-6 shrink-0" />
            <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.1em] transition-opacity ${sidebarExpanded ? "opacity-100" : "opacity-0"}`}>Stratxcel</span>
            <button
              type="button"
              onClick={togglePinned}
              className={`saut-btn saut-btn-ghost !h-7 !w-7 !justify-center !p-0 transition-opacity ${sidebarExpanded ? "opacity-100" : "pointer-events-none opacity-0"}`}
              aria-pressed={sidebarPinned}
              aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
              title={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {sidebarPinned ? "\u25cf" : "\u25cb"}
            </button>
          </div>
          {SOCIAL_NAV.map((item) => <NavLink key={item.href} item={item} expanded={sidebarExpanded} />)}
          <div className="mt-auto space-y-1 border-t pt-2" style={{ borderColor: "var(--saut-border)" }}>
            {SOCIAL_UTILITY_NAV.map((item) => <NavLink key={item.href} item={item} expanded={sidebarExpanded} />)}
            <Link href="/admin" aria-label="Admin console" title={sidebarExpanded ? undefined : "Admin console"} className="flex h-9 items-center gap-3 rounded-lg px-[11px] text-xs" style={{ color: "var(--saut-text-subtle)" }}>
              <span aria-hidden className="w-[18px] shrink-0 text-center">{"\u2190"}</span>
              <span className={`truncate transition-opacity ${sidebarExpanded ? "opacity-100" : "opacity-0"}`}>Admin console</span>
            </Link>
          </div>
        </nav>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}>
          <button className="rounded-lg border px-2.5 py-1.5 text-xs lg:hidden" style={{ borderColor: "var(--saut-border-strong)" }} onClick={() => setMobileOpen((v) => !v)} aria-expanded={mobileOpen} aria-label="Toggle navigation">
            Menu
          </button>
          <span className="text-sm font-semibold">Social Autopilot</span>
          <span
            className="saut-chip"
            style={!shadowMode
              ? { background: "rgb(240 180 41 / 0.10)", border: "1px solid rgb(240 180 41 / 0.30)", color: "#f3c55c" }
              : { background: "rgb(53 201 140 / 0.10)", border: "1px solid rgb(53 201 140 / 0.28)", color: "#5bdca7" }}
          >
            <span className="saut-chip-dot saut-pulse" style={{ background: !shadowMode ? "var(--saut-warning)" : "var(--saut-success)" }} />
            {!shadowMode ? "Live publishing" : "Shadow mode"}
          </span>
          <span className="ml-auto truncate text-xs" style={{ color: "var(--saut-text-subtle)" }}>{email}</span>
        </header>

        {mobileOpen && (
          <nav className="z-20 flex shrink-0 flex-col gap-1 border-b p-3 lg:hidden" style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}>
            {[...SOCIAL_NAV, ...SOCIAL_UTILITY_NAV].map((item) => (
              <NavLink key={item.href} item={item} expanded onNavigate={() => setMobileOpen(false)} />
            ))}
          </nav>
        )}

        <main className={`min-h-0 min-w-0 flex-1 ${isFullPage ? "overflow-hidden p-0" : "overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"}`}>{children}</main>
      </div>

      {showDock && <div className="saut-copilot-dock-wrap"><CopilotDockPanel /></div>}
      {showMinimized && <MinimizedButton />}
    </div>
  );
}
