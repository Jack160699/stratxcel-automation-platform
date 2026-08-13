"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Overlay";

export interface BottomNavItem {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  live?: boolean;
}

/**
 * Premium floating customer dock, <768px. Five slots max; More opens a
 * bottom sheet (never a right drawer). Admin uses a separate component.
 */
export function MobileBottomNav({
  items,
  activeKey,
  moreGroups,
}: {
  items: BottomNavItem[];
  activeKey: string;
  moreGroups: { label: string; items: { key: string; label: string; href: string; icon?: ReactNode }[] }[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.slice(0, 4);

  return (
    <>
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--sx-z-nav,20)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="pointer-events-auto mx-auto grid h-16 max-w-lg grid-cols-5 rounded-[1.35rem] border border-sx-border bg-[color-mix(in_srgb,var(--sx-bg)_86%,transparent)] shadow-[var(--sx-shadow-xl)] backdrop-blur-xl">
          {primary.map((item) => {
            const active = item.key === activeKey;
            const content = (
              <>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-sx-accent/15 text-sx-accent" : "text-sx-text-subtle"}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium ${active ? "text-sx-accent" : "text-sx-text-subtle"}`}>{shortLabel(item.label)}</span>
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
            type="button"
            onClick={() => setMoreOpen(true)}
            className="relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-sx-text-subtle"
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${moreOpen ? "bg-sx-accent/15 text-sx-accent" : ""}`}>
              <MoreIcon />
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          {moreGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="px-1 pb-1 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-sx-sm px-2.5 text-[13px] text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function shortLabel(label: string): string {
  if (label === "Command Center") return "Home";
  if (label === "Business Growth Audit") return "Audit";
  if (label === "Leads & CRM") return "CRM";
  return label;
}

function MoreIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4.5 10h.01M10 10h.01M15.5 10h.01" strokeLinecap="round" />
    </svg>
  );
}
