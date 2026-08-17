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
 * Mobile-first fixed bottom navigation dock (<768px).
 * 5 primary slots: Home, Audit, Copilot, Business, More.
 * Fixed while scrolling, with generous touch targets (48px+).
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
        aria-label="Mobile Bottom Navigation"
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-auto border-t border-sx-border/80 bg-sx-surface-1/95 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1 shadow-2xl backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid h-14 max-w-md grid-cols-5 items-center">
          {primary.map((item) => {
            const active = item.key === activeKey;
            const content = (
              <>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-95 ${
                    active ? "bg-sx-accent/15 text-sx-accent" : "text-sx-text-muted"
                  }`}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[11px] font-semibold tracking-tight transition-colors ${
                    active ? "text-sx-accent font-bold" : "text-sx-text-muted"
                  }`}
                >
                  {shortLabel(item.label)}
                </span>
                {item.live && <span className="absolute right-[calc(50%-14px)] top-1.5 h-1.5 w-1.5 rounded-full bg-sx-success" />}
              </>
            );
            return item.href ? (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-[48px] flex-col items-center justify-center gap-0.5"
              >
                {content}
              </Link>
            ) : null;
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Open more menu"
            className="relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-sx-text-muted transition-transform active:scale-95"
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                moreOpen ? "bg-sx-accent/15 text-sx-accent" : ""
              }`}
            >
              <MoreIcon />
            </span>
            <span className={`text-[11px] font-semibold tracking-tight ${moreOpen ? "text-sx-accent font-bold" : "text-sx-text-muted"}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* App-style "More" Sheet */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu & Shortcuts">
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pb-4">
          {moreGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
                {group.label}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {group.items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-[48px] items-center gap-3.5 rounded-sx-md px-3 text-[15px] font-medium text-sx-text hover:bg-sx-surface-2 active:bg-sx-surface-3 transition-colors"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-sx-sm bg-sx-surface-2 text-sx-text-muted">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-sx-border/60">
            <Link
              href="/contact"
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[48px] items-center gap-3.5 rounded-sx-md px-3 text-[15px] font-medium text-sx-text-muted hover:bg-sx-surface-2 transition-colors"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-sx-sm bg-sx-surface-2 text-sx-text-muted">
                💬
              </span>
              <span>Help & Support</span>
            </Link>
          </div>
        </div>
      </Modal>
    </>
  );
}

function shortLabel(label: string): string {
  if (label === "Command Center" || label === "Home") return "Home";
  if (label === "Business Growth Audit" || label === "Audit") return "Audit";
  if (label === "Brand Brain" || label === "Business") return "Business";
  if (label === "Copilot") return "Copilot";
  return label;
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 10h.01M10 10h.01M15.5 10h.01" strokeLinecap="round" />
    </svg>
  );
}

