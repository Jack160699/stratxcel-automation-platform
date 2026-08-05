"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/Overlay";

export interface BottomNavItem {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  live?: boolean;
}

/**
 * 56px bottom tab bar, <768px — docs/product-design/RESPONSIVE_AND_MOBILE_SPECIFICATION.md
 * §2. Exactly 5 slots; the last is always "More", opening a sheet with the
 * full nav grouping (not a flattened list). Touch targets ≥44px.
 */
export function MobileBottomNav({
  items,
  activeKey,
  moreGroups,
}: {
  items: BottomNavItem[];
  activeKey: string;
  moreGroups: { label: string; items: { key: string; label: string; href: string }[] }[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.slice(0, 4);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[var(--sx-z-nav,20)] grid h-14 grid-cols-5 border-t border-sx-border bg-sx-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => {
          const active = item.key === activeKey;
          const content = (
            <>
              <span className={active ? "text-sx-accent" : "text-sx-text-subtle"}>{item.icon}</span>
              <span className={`text-[9.5px] ${active ? "text-sx-accent" : "text-sx-text-subtle"}`}>{item.label}</span>
              {item.live && <span className="absolute right-[calc(50%-14px)] top-1.5 h-1.5 w-1.5 rounded-full bg-sx-success" />}
            </>
          );
          return item.href ? (
            <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined} className="relative flex min-h-11 flex-col items-center justify-center gap-0.5">
              {content}
            </Link>
          ) : null;
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-sx-text-subtle"
        >
          <MoreIcon />
          <span className="text-[9.5px]">More</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="right" widthClassName="w-72 max-w-[85vw]">
        <div className="flex flex-col gap-4 p-4">
          {moreGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="px-1 pb-1 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-[#4B5666]">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-11 items-center rounded-sx-sm px-2.5 text-[13px] text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}

function MoreIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4.5 10h.01M10 10h.01M15.5 10h.01" strokeLinecap="round" />
    </svg>
  );
}
