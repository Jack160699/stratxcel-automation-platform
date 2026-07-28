"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/app/components/Mark";
import { SOCIAL_NAV, SOCIAL_UTILITY_NAV, type SocialNavItem } from "./nav";
import { useCopilot, sessionStatusLabel } from "./copilot/CopilotContext";
import { CopilotDockPanel } from "./copilot/CopilotDockPanel";
import { MinimizedButton } from "./copilot/MinimizedButton";

function NavStatusDot() {
  const { sessionStatus } = useCopilot();
  const { label, tone } = sessionStatusLabel(sessionStatus);
  if (tone === "idle") return null;
  const color =
    tone === "working" ? "var(--saut-ai)" : tone === "waiting" ? "var(--saut-warning)" : "var(--saut-danger)";
  return (
    <span className="ml-auto flex items-center gap-1.5" title={label}>
      <span className={`h-[6px] w-[6px] rounded-full ${tone === "working" ? "saut-pulse" : ""}`} style={{ background: color }} aria-hidden />
      <span className="saut-mono text-[9.5px] uppercase tracking-wide" style={{ color }}>
        {label}
      </span>
    </span>
  );
}

function NavLink({ item, onNavigate }: { item: SocialNavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.href === "/admin/social" ? pathname === item.href : pathname.startsWith(item.href);
  const isCopilot = item.href === "/admin/social/copilot";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex h-9 items-center rounded-lg px-3 text-sm transition"
      style={
        active
          ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)", boxShadow: "inset 2px 0 0 var(--saut-accent)" }
          : { color: "var(--saut-text-muted)" }
      }
    >
      {item.label}
      {isCopilot && <NavStatusDot />}
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
  const { panelMode, isFullPage } = useCopilot();
  const showDock = panelMode === "docked" && !isFullPage;
  const showMinimized = panelMode === "minimized" && !isFullPage;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <nav
        className="hidden w-[240px] shrink-0 flex-col gap-1 border-r p-3 lg:flex"
        style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}
      >
        <div className="flex items-center gap-2 px-2 py-3">
          <Mark className="h-6 w-6" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em]">Stratxcel</span>
          <span
            className="saut-mono ml-auto rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            style={{ background: "var(--saut-accent-muted)", color: "var(--saut-ai)" }}
          >
            Autopilot
          </span>
        </div>
        {SOCIAL_NAV.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="mt-auto space-y-1 border-t pt-2" style={{ borderColor: "var(--saut-border)" }}>
          {SOCIAL_UTILITY_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          <Link
            href="/admin"
            className="flex h-9 items-center rounded-lg px-3 text-xs"
            style={{ color: "var(--saut-text-subtle)" }}
          >
            ← Admin console
          </Link>
        </div>
      </nav>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Top bar */}
        <header
          className="flex h-14 items-center gap-3 border-b px-4"
          style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}
        >
          <button
            className="rounded-lg border px-2.5 py-1.5 text-xs lg:hidden"
            style={{ borderColor: "var(--saut-border-strong)" }}
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            Menu
          </button>
          <span className="text-sm font-semibold">Social Autopilot</span>
          <span
            className="saut-chip"
            style={
              !shadowMode
                ? { background: "rgb(240 180 41 / 0.10)", border: "1px solid rgb(240 180 41 / 0.30)", color: "#f3c55c" }
                : { background: "rgb(53 201 140 / 0.10)", border: "1px solid rgb(53 201 140 / 0.28)", color: "#5bdca7" }
            }
          >
            <span
              className="saut-chip-dot saut-pulse"
              style={{ background: !shadowMode ? "var(--saut-warning)" : "var(--saut-success)" }}
            />
            {!shadowMode ? "Live publishing" : "Shadow mode"}
          </span>
          <span className="ml-auto text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            {email}
          </span>
        </header>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <nav
            className="flex flex-col gap-1 border-b p-3 lg:hidden"
            style={{ borderColor: "var(--saut-border)", background: "var(--saut-surface-1)" }}
          >
            {[...SOCIAL_NAV, ...SOCIAL_UTILITY_NAV].map((item) => (
              <NavLink key={item.href} item={item} onNavigate={() => setMobileOpen(false)} />
            ))}
          </nav>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {showDock && (
        <div className="saut-copilot-dock-wrap">
          <CopilotDockPanel />
        </div>
      )}
      {showMinimized && <MinimizedButton />}
    </div>
  );
}
