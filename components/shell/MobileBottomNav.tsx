"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { WHATSAPP_NUMBER } from "@/lib/constants";

export interface BottomNavItem {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  live?: boolean;
  /** Hindi sub-label — customer shell only (StratXcel App Design Spec §4.1). */
  labelHi?: string;
}

/**
 * Mobile-first fixed bottom navigation dock (<768px).
 * 5 primary slots: Home, Audit, Copilot, Business, More.
 * Fixed while scrolling, with generous touch targets (48px+).
 *
 * `customer` (product === "App") switches to the calm StratXcel App Design
 * Spec visual language — spec §5.6 — while keeping the same 4-primary +
 * More-sheet structure the real product IA needs (Website, Connectors,
 * Billing, Team, Settings don't fit a strict 4-tab dock without deleting
 * destinations). /admin is untouched.
 */
export function MobileBottomNav({
  items,
  activeKey,
  moreGroups,
  customer = false,
}: {
  items: BottomNavItem[];
  activeKey: string;
  moreGroups: { label: string; items: { key: string; label: string; href: string; icon?: ReactNode }[] }[];
  customer?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.slice(0, 4);

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className={
          customer
            ? "fixed inset-x-0 bottom-0 z-30 pointer-events-auto border-t border-sx-border bg-sx-surface-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
            : "fixed inset-x-0 bottom-0 z-30 pointer-events-auto border-t border-sx-border/80 bg-sx-surface-1/95 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1 shadow-2xl backdrop-blur-xl md:hidden"
        }
      >
        <div className={customer ? "mx-auto grid h-16 max-w-md grid-cols-5 items-center" : "mx-auto grid h-14 max-w-md grid-cols-5 items-center"}>
          {primary.map((item) => {
            const active = item.key === activeKey;
            const content = customer ? (
              <>
                <span className={active ? "text-sx-accent" : "text-sx-text-muted"}>{item.icon}</span>
                <span className={`text-[11px] font-semibold tracking-tight ${active ? "text-sx-accent" : "text-sx-text-muted"}`}>
                  {shortLabel(item.label)}
                </span>
                <span className={`h-1 w-1 rounded-full ${active ? "bg-sx-accent" : "bg-transparent"}`} />
                {item.live && <span className="absolute right-[calc(50%-14px)] top-1.5 h-1.5 w-1.5 rounded-full bg-sx-success" />}
              </>
            ) : (
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
                prefetch={true}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 min-h-[48px] flex-col items-center justify-center gap-1 ${customer ? "active:scale-95 transition-transform" : ""}`}
              >
                {content}
              </Link>
            ) : null;
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Open more menu"
            className={`relative flex min-h-11 min-h-[48px] flex-col items-center justify-center gap-1 text-sx-text-muted transition-transform active:scale-95`}
          >
            {customer ? (
              <>
                <span className={moreOpen ? "text-sx-accent" : "text-sx-text-muted"}>
                  <MoreIcon />
                </span>
                <span className={`text-[11px] font-semibold tracking-tight ${moreOpen ? "text-sx-accent" : "text-sx-text-muted"}`}>More</span>
                <span className={`h-1 w-1 rounded-full ${moreOpen ? "bg-sx-accent" : "bg-transparent"}`} />
              </>
            ) : (
              <>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${moreOpen ? "bg-sx-accent/15 text-sx-accent" : ""}`}>
                  <MoreIcon />
                </span>
                <span className={`text-[11px] font-semibold tracking-tight ${moreOpen ? "text-sx-accent font-bold" : "text-sx-text-muted"}`}>More</span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* App-style "More" Sheet */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={customer ? "More" : "Menu & Shortcuts"}>
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pb-4">
          {moreGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
                {group.label}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {group.items.map((item) => {
                  const description = customer ? MORE_SHEET_DESCRIPTIONS[item.key] : undefined;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      prefetch={true}
                      onClick={() => setMoreOpen(false)}
                      className={
                        customer
                          ? "flex min-h-[52px] items-center gap-3.5 rounded-sx-md px-3 py-2 text-[15px] font-medium text-sx-text hover:bg-sx-surface-2 active:bg-sx-surface-3 transition-colors"
                          : "flex min-h-[48px] items-center gap-3.5 rounded-sx-md px-3 text-[15px] font-medium text-sx-text hover:bg-sx-surface-2 active:bg-sx-surface-3 transition-colors"
                      }
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-2 text-sx-text-muted">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {description && <span className="block truncate text-xs font-normal text-sx-text-subtle">{description}</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-sx-border/60">
            {customer ? (
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMoreOpen(false)}
                className="flex min-h-[48px] items-center gap-3.5 rounded-sx-md px-3 text-[15px] font-medium text-sx-text hover:bg-sx-surface-2 transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-sx-sm bg-sx-surface-2 text-sx-text-muted">
                  💬
                </span>
                <span>WhatsApp Help & Support</span>
              </a>
            ) : (
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
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Real, one-line descriptions for the customer "More" sheet — StratXcel App reference row pattern (icon + title + subtitle). Text describes the actual destination, not fabricated content. */
const MORE_SHEET_DESCRIPTIONS: Record<string, string> = {
  brand: "Your business profile, hours, and Brand Brain",
  website: "Manage your live business site and domains",
  integrations: "Google, WhatsApp, Instagram, Facebook",
  billing: "Plan, wallet, and invoices",
  team: "Invite staff and manage roles",
  settings: "Profile, appearance, support",
};

function shortLabel(label: string): string {
  if (label === "Command Center" || label === "Home") return "Home";
  if (label === "Business Growth Audit" || label === "Audit") return "Audit";
  if (label === "Content" || label === "Content & Media") return "Content";
  if (label === "Growth" || label === "Growth Analytics" || label === "Reports") return "Growth";
  if (label === "Brand" || label === "Shop Profile" || label === "Brand Brain") return "Brand";
  return label;
}

// Master build brief sections 19-20 ("prefer appropriate use of...
// Lucide"): replaced the hand-drawn 3-dot icon with lucide-react's own.
function MoreIcon() {
  return <MoreHorizontal size={20} strokeWidth={1.6} />;
}

