"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/Overlay";

export interface SidebarNavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: string | number;
  /** Live agent activity indicator next to the item, e.g. a running Copilot session. */
  live?: boolean;
  /** Hindi sub-label — customer shell only (StratXcel App Design Spec §4.1). */
  labelHi?: string;
}

export interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

const COLLAPSE_KEY = "sx-sidebar-collapsed";

/**
 * The one sidebar shared by /app and /admin (different item arrays — see
 * components/shell/navigation/{app,admin}-navigation.tsx — same visual
 * component). Desktop behavior is deliberately simple and stable: expanded
 * by default, occupying real flex-row layout space (never an absolutely
 * positioned overlay), collapsed only via an explicit button click, never
 * on hover. The previous hover-expand-as-overlay interaction (64px default,
 * expands over the workspace on pointer hover, collapses when the pointer
 * leaves) read as broken rather than intentional — a user shouldn't have to
 * discover navigation by accidentally hovering a debug rail.
 */
export function Sidebar({
  groups,
  activeKey,
  brand,
  customer = false,
}: {
  groups: SidebarNavGroup[];
  activeKey: string;
  /** Render-prop so the brand lockup can react to collapse state (e.g. hide the wordmark when collapsed) — collapse state lives inside Sidebar, not lifted to the caller. */
  brand: (collapsed: boolean) => ReactNode;
  /** Customer app (product === "App") visual mode — spec §5.6: 56px rows, icon + English + Hindi label, brand-tint active state, no collapse. /admin never sets this. */
  customer?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (customer) return;
    // Client-only localStorage preference; SSR has no access to it, so it
    // can't be a lazy useState initializer (same accepted pattern as
    // app/admin/(shell)/platform/tenants/page.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    setHydrated(true);
  }, [customer]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  if (customer) {
    return (
      <nav aria-label="Primary" className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-x-hidden border-r border-sx-border bg-sx-bg px-4 py-6">
        <div className="mb-2 px-1">{brand(false)}</div>
        <div className="sx-thin-scroll mt-4 flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
          {groups.map((group, gi) =>
            group.items.map((item) => {
              const active = item.key === activeKey;
              return (
                <Link
                  key={item.key ?? gi}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-14 min-w-0 items-center gap-3 rounded-sx-md px-3.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                    active ? "bg-sx-accent-muted text-sx-accent" : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                  }`}
                >
                  {active && <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-sx-accent" />}
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold">{item.label}</span>
                    {item.labelHi && <span className="sx-hi truncate text-xs text-sx-text-muted">{item.labelHi}</span>}
                  </span>
                  {item.live && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-sx-pulse rounded-full bg-sx-success" />}
                </Link>
              );
            })
          )}
        </div>
        <p className="px-2 text-xs text-sx-text-subtle">Account settings live under your avatar.</p>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Primary"
      style={{ transitionDuration: hydrated ? "140ms" : "0ms" }}
      className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-x-hidden border-r border-sx-border bg-sx-surface-1 py-3.5 transition-[width] ease-out ${
        collapsed ? "w-16 items-center" : "w-[232px] items-stretch px-2.5"
      }`}
    >
      <div className={`mb-1 flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-1.5"}`}>
        {brand(collapsed)}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            className="ml-auto rounded-sx-xs p-1 text-sx-text-subtle hover:bg-sx-surface-2 hover:text-sx-text"
          >
            <CollapseIcon />
          </button>
        )}
      </div>
      {collapsed && (
        <Tooltip label="Expand sidebar">
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="mb-1 flex h-8 w-10 items-center justify-center rounded-sx-xs text-sx-text-subtle hover:bg-sx-surface-2 hover:text-sx-text"
          >
            <ExpandIcon />
          </button>
        </Tooltip>
      )}

      <div className="sx-thin-scroll flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="flex flex-col gap-0.5">
            {group.label && !collapsed && (
              <div className="px-2.5 pb-1 pt-2 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-[#4B5666]">{group.label}</div>
            )}
            {group.items.map((item) => {
              const active = item.key === activeKey;
              const link = (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-8 min-w-0 items-center gap-2.5 rounded-sx-sm text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                    collapsed ? "w-10 justify-center" : "px-2.5"
                  } ${
                    active
                      ? "bg-sx-accent-muted text-sx-text shadow-[inset_2px_0_0_var(--sx-accent)]"
                      : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                  }`}
                >
                  <span className={`shrink-0 ${active ? "text-sx-accent" : ""}`}>{item.icon}</span>
                  {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                  {!collapsed && item.badge != null && (
                    <span className="ml-auto shrink-0 font-sx-mono text-[10px] text-sx-text-subtle">{item.badge}</span>
                  )}
                  {!collapsed && item.live && <span className="h-1.5 w-1.5 shrink-0 animate-sx-pulse rounded-full bg-sx-success" />}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.key} label={item.label}>
                  {link}
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M6.5 2.5v11" />
      <path d="M4.3 6l-1.3 2 1.3 2" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M6.5 2.5v11" />
      <path d="M11.7 6l1.3 2-1.3 2" />
    </svg>
  );
}
