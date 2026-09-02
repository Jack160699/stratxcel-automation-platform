"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  businessCard,
  footer,
}: {
  groups: SidebarNavGroup[];
  activeKey: string;
  /** Render-prop so the brand lockup can react to collapse state (e.g. hide the wordmark when collapsed) — collapse state lives inside Sidebar, not lifted to the caller. */
  brand: (collapsed: boolean) => ReactNode;
  /** Customer app (product === "App") visual mode — spec §5.6: 56px rows, icon + English + Hindi label, brand-tint active state, no collapse. /admin never sets this. */
  customer?: boolean;
  /** Customer-only business identity card under the brand mark (StratXcel Desktop canvas) — business name + live connection status. Rendered as-is; the caller (page) supplies real tenant data, Sidebar never fetches it itself. */
  businessCard?: ReactNode;
  /** Customer-only user identity footer (StratXcel Desktop canvas). */
  footer?: ReactNode;
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
      <nav aria-label="Primary" className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-x-hidden border-r border-sx-border bg-sx-surface-1 px-3 py-5">
        <div className="mb-1 px-2">{brand(false)}</div>
        {businessCard}
        <div className="sx-thin-scroll mt-1 flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi} className="flex flex-col gap-0.5">
              {gi > 0 && <div className="mx-3 my-2 h-px bg-sx-border" />}
              {group.items.map((item) => {
                const active = item.key === activeKey;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={true}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-11 min-w-0 items-center gap-2.5 rounded-sx-sm px-3 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                      active ? "bg-sx-accent-muted text-sx-accent" : "text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className={`truncate text-[14px] ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
                      {item.labelHi && <span className="sx-hi truncate text-[10.5px] text-sx-text-subtle">{item.labelHi}</span>}
                    </span>
                    {item.live && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-sx-pulse rounded-full bg-sx-success" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        {footer}
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
                  // STRATXCEL full-system closure brief, Section 3/4 (real
                  // measured performance sweep): real, measured finding on
                  // /admin/social/system -- every admin page's real, live
                  // performance.getEntriesByType("resource") showed ~49
                  // real background fetch requests (two full passes over
                  // every one of the ~25 sidebar items) totaling ~18.8s of
                  // cumulative fetch time, purely from Next.js's own
                  // default automatic viewport-triggered RSC prefetch on
                  // every admin nav link -- every admin page is a real,
                  // force-dynamic, DB-querying route (see e.g. this exact
                  // page's own maxDuration=300 comment), so "prefetch
                  // everything visible in the sidebar" means firing a real
                  // server request (and a real DB round-trip on the
                  // destination page) for every one of ~25 pages a staff
                  // member almost never all visits in one session. The
                  // customer sidebar (the `if (customer)` branch above)
                  // deliberately keeps prefetch={true} -- a much smaller,
                  // lighter customer nav genuinely benefits from instant
                  // nav. Admin does not: disabling automatic prefetch here
                  // does not remove navigation -- a real click still
                  // navigates immediately; it only stops the unsolicited
                  // eager fetch of every other page's real data on load.
                  prefetch={false}
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

// Master build brief sections 19-20 ("prefer appropriate use of... Lucide"):
// replaced two hand-drawn panel-collapse/expand icons with their real
// lucide-react equivalents, same 14px size and 1.5 stroke width preserved.
function CollapseIcon() {
  return <PanelLeftClose size={14} strokeWidth={1.5} />;
}
function ExpandIcon() {
  return <PanelLeftOpen size={14} strokeWidth={1.5} />;
}
