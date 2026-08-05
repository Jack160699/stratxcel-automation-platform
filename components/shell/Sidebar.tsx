"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/Overlay";

export interface SidebarNavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: string | number;
  /** Live agent activity indicator next to the item, e.g. a running Copilot session. */
  live?: boolean;
}

export interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

/**
 * The one sidebar shared by /app and /admin — docs/product-design/SIDEBAR_INTERACTION_SPECIFICATION.md.
 * 64px collapsed (default) / 248px expanded, expands on pointer hover or
 * keyboard focus-within, collapses when both leave (unless pinned), 140ms
 * ease-out, overlays the workspace rather than shifting it. Pin state
 * persists in localStorage per SIDEBAR_INTERACTION_SPECIFICATION.md §2
 * ("may persist locally").
 */
export function Sidebar({
  groups,
  activeKey,
  brand,
}: {
  groups: SidebarNavGroup[];
  activeKey: string;
  brand: ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // Reading a client-only localStorage preference on mount; SSR has no access to it,
    // so it can't be a lazy useState initializer (same accepted pattern as
    // app/admin/(shell)/platform/tenants/page.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(window.localStorage.getItem("sx-sidebar-pinned") === "1");
    setHydrated(true);
  }, []);

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    window.localStorage.setItem("sx-sidebar-pinned", next ? "1" : "0");
  }

  const expanded = pinned || hoverExpanded;

  return (
    // Flow spacer: always 64px unless pinned. The nav itself is absolutely
    // positioned inside it, so a transient hover-expand overlays the
    // workspace (per SIDEBAR_INTERACTION_SPECIFICATION.md §1) instead of
    // shifting it — only a deliberate pin widens the reserved flow space.
    <div className={`sticky top-0 h-screen shrink-0 ${pinned ? "w-[248px]" : "w-16"}`}>
      <nav
        ref={ref}
        aria-label="Primary"
        onMouseEnter={() => setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
        onFocus={() => setHoverExpanded(true)}
        onBlur={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node)) setHoverExpanded(false);
        }}
        style={{ transitionDuration: hydrated ? "140ms" : "0ms" }}
        className={`absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-sx-border bg-sx-surface-1 py-3.5 transition-[width] ease-out ${
          expanded ? "w-[248px] items-stretch px-2.5 shadow-[var(--sx-shadow-lg)]" : "w-16 items-center"
        }`}
      >
      <div className={`mb-1 flex items-center gap-2.5 ${expanded ? "px-1.5" : "justify-center"}`}>
        {brand}
        {expanded && (
          <button
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar expanded"}
            className={`ml-auto rounded-sx-xs p-1 text-sx-text-subtle hover:text-sx-text ${pinned ? "text-sx-accent" : ""}`}
          >
            <PinIcon />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="flex flex-col gap-0.5">
            {group.label && expanded && (
              <div className="px-2.5 pb-1 pt-2 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-[#4B5666]">{group.label}</div>
            )}
            {group.items.map((item) => {
              const active = item.key === activeKey;
              const link = (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-8 items-center gap-2.5 rounded-sx-sm text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                    expanded ? "px-2.5" : "w-10 justify-center"
                  } ${
                    active
                      ? "bg-sx-accent-muted text-sx-text shadow-[inset_2px_0_0_var(--sx-accent)]"
                      : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                  }`}
                >
                  <span className={`shrink-0 ${active ? "text-sx-accent" : ""}`}>{item.icon}</span>
                  {expanded && <span className="truncate">{item.label}</span>}
                  {expanded && item.badge != null && (
                    <span className="ml-auto shrink-0 font-sx-mono text-[10px] text-sx-text-subtle">{item.badge}</span>
                  )}
                  {expanded && item.live && <span className="h-1.5 w-1.5 shrink-0 animate-sx-pulse rounded-full bg-sx-success" />}
                </Link>
              );
              return expanded ? link : <Tooltip key={item.key} label={item.label}>{link}</Tooltip>;
            })}
          </div>
        ))}
      </div>
      </nav>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2v5.5M5 7.5h6l1 4H4l1-4Z" />
      <path d="M8 11.5V14" />
    </svg>
  );
}
