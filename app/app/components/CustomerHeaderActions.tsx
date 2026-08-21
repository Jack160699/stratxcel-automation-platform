"use client";

import Link from "next/link";
import { useState } from "react";
import type { CustomerPlanSummary } from "@/lib/billing/customer-plan";
import { Modal } from "@/components/ui/Overlay";
import { ContextSwitcher } from "@/components/shell/ContextSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import { signOutAction } from "../actions";

interface NotificationSignal {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: "warning" | "accent";
}

interface CustomerHeaderActionsProps {
  tenantId: string;
  name: string | null;
  email: string;
  plan: CustomerPlanSummary;
  showPlanPrompt: boolean;
  auditOpportunityCount: number | null;
  isStaff?: boolean;
  /** Real signals only — StratXcel App reference Notifications screen. */
  notifications: NotificationSignal[];
}

export function CustomerHeaderActions({
  tenantId,
  name,
  email,
  plan,
  showPlanPrompt,
  auditOpportunityCount,
  isStaff = false,
  notifications,
}: CustomerHeaderActionsProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [planPromptOpen, setPlanPromptOpen] = useState(showPlanPrompt);
  const { theme, setTheme } = useTheme();
  const initials = initialsFor(name, email);

  async function dismissPlanPrompt() {
    setPlanPromptOpen(false);
    await fetch("/api/platform/account/plan-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    }).catch(() => undefined);
  }

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-3">
        {isStaff && <ContextSwitcher currentContext="user" compact />}
        <Link
          href="/app/billing"
          className="hidden min-h-8 items-center rounded-full border border-sx-accent/30 bg-sx-accent/10 px-3 text-[12px] font-semibold text-sx-accent hover:bg-sx-accent/15 sm:inline-flex transition-colors"
          aria-label={`Current plan: ${plan.name}. View billing`}
        >
          {plan.name}
        </Link>
        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          aria-label={notifications.length > 0 ? `Notifications (${notifications.length} new)` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text transition-colors"
        >
          <BellIcon />
          {notifications.length > 0 && (
            <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-sx-surface-1 bg-sx-danger" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Open profile"
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gradient-to-br from-sx-royal to-sx-ai text-xs sm:text-sm font-bold text-white shadow-sm ring-2 ring-sx-bg transition-transform active:scale-95"
        >
          {initials}
        </button>
      </div>

      {/* Notifications — StratXcel App reference row structure (icon square, title, subtitle, chevron), real signals only */}
      <Modal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications">
        {notifications.length === 0 ? (
          <div className="py-6 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sx-surface-2 text-sx-text-subtle">
              <BellIcon />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-sx-text">You&apos;re all caught up</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-sx-text-muted">
              There are no unread notifications. Real-time updates on your audit and campaigns will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-1">
            {notifications.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                onClick={() => setNotificationsOpen(false)}
                className="flex items-start gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-accent/40"
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm ${
                    n.tone === "warning" ? "bg-[var(--sx-warning-tint)] text-sx-warning" : "bg-sx-accent-muted text-sx-accent"
                  }`}
                >
                  {n.tone === "warning" ? <AlertIcon /> : <TargetIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-sx-text">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-sx-text-subtle">{n.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Modal>

      {/* Compact App-Style Profile Sheet */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Account & Profile">
        <div className="max-h-[min(70vh,38rem)] overflow-y-auto space-y-4 pb-2">
          {/* User Info Header */}
          <div className="flex items-center gap-3 rounded-sx-md bg-sx-surface-2 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sx-royal to-sx-ai text-sm font-bold text-white shadow-sm">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-sx-text">{name || "StratXcel User"}</p>
              <p className="truncate text-[13px] text-sx-text-muted">{email}</p>
            </div>
          </div>

          {/* Plan & Wallet Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">Plan</p>
              <p className="mt-0.5 text-[15px] font-bold text-sx-text">{plan.name}</p>
              <p className="text-[11px] text-sx-text-muted">{plan.status}</p>
            </div>
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">Wallet</p>
              <p className="mt-0.5 text-[15px] font-bold text-sx-text">{plan.activePaid ? "Active" : "₹0"}</p>
              <Link href="/app/billing" onClick={() => setProfileOpen(false)} className="text-[11px] font-semibold text-sx-accent hover:underline">
                Manage →
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 divide-y divide-sx-border/60">
            <Link
              href="/app/billing"
              onClick={() => setProfileOpen(false)}
              className="flex min-h-[44px] items-center justify-between px-3 text-[14px] font-medium text-sx-text hover:bg-sx-surface-2 transition-colors"
            >
              <span>Billing & Subscriptions</span>
              <span className="text-sx-text-muted text-xs">›</span>
            </Link>
            <Link
              href="/app/settings"
              onClick={() => setProfileOpen(false)}
              className="flex min-h-[44px] items-center justify-between px-3 text-[14px] font-medium text-sx-text hover:bg-sx-surface-2 transition-colors"
            >
              <span>Account Settings</span>
              <span className="text-sx-text-muted text-xs">›</span>
            </Link>
            <Link
              href="/forgot-password"
              onClick={() => setProfileOpen(false)}
              className="flex min-h-[44px] items-center justify-between px-3 text-[14px] font-medium text-sx-text hover:bg-sx-surface-2 transition-colors"
            >
              <span>Reset Password</span>
              <span className="text-sx-text-muted text-xs">›</span>
            </Link>
          </div>

          {/* Theme Preference */}
          <div className="pt-1">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">Appearance</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Appearance">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  aria-pressed={theme === option}
                  className={`min-h-[40px] rounded-sx-sm border text-[13px] font-semibold capitalize transition-colors ${
                    theme === option
                      ? "border-sx-accent bg-sx-accent/10 text-sx-accent"
                      : "border-sx-border text-sx-text-muted hover:bg-sx-surface-2"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {isStaff && (
            <div className="rounded-sx-sm border border-sx-accent/30 bg-sx-accent/10 p-3">
              <p className="text-[12px] font-medium text-sx-text">Staff Workspace Mode</p>
              <div className="mt-2">
                <ContextSwitcher currentContext="user" />
              </div>
            </div>
          )}

          {/* Sign Out Button */}
          <form action={signOutAction} className="pt-2">
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-sx-md border border-sx-danger/30 text-[14px] font-semibold text-sx-danger hover:bg-sx-danger/10 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </Modal>

      <Modal open={planPromptOpen} onClose={() => void dismissPlanPrompt()} title="Your recommended next step">
        <div>
          <div className="rounded-sx-md border border-sx-accent/30 bg-sx-accent/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sx-accent">Recommended for your business</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-sx-text">Growth</p>
                <p className="mt-1 text-sm text-sx-text-muted">Ongoing execution after your Business Growth Audit.</p>
              </div>
              <p className="shrink-0 text-right text-lg font-semibold text-sx-text">₹9,999<span className="text-xs font-normal text-sx-text-muted">/mo</span></p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-sx-text-muted">
            {auditOpportunityCount && auditOpportunityCount > 0
              ? `Your Audit identified ${auditOpportunityCount} growth ${auditOpportunityCount === 1 ? "opportunity" : "opportunities"}. Growth adds ongoing planning, execution, and Copilot support.`
              : "Growth is designed for businesses that want Stratxcel to turn research into ongoing planning, execution, and measurable improvements."}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-sx-text-muted">
            <li>✓ Ongoing growth missions and recommendations</li>
            <li>✓ Copilot-guided planning and execution</li>
            <li>✓ More automation and managed AI capacity</li>
          </ul>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href="/app/billing" onClick={() => void dismissPlanPrompt()} className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-sm font-bold text-sx-accent-on">
              View Growth
            </Link>
            <button type="button" onClick={() => void dismissPlanPrompt()} className="min-h-11 rounded-sx-sm border border-sx-border-strong text-sm font-semibold text-sx-text-muted">
              Not now
            </button>
          </div>
          <Link href="/app/billing" onClick={() => void dismissPlanPrompt()} className="mt-3 block text-center text-sm font-semibold text-sx-accent hover:underline">
            View all plans
          </Link>
        </div>
      </Modal>
    </>
  );
}

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-sx-text-subtle">{title}</h3>
      {children}
    </section>
  );
}

function SheetLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="flex min-h-11 items-center justify-between border-t border-sx-border px-1 text-sm text-sx-text-muted first:border-t-0 hover:text-sx-text">
      {label} <span aria-hidden="true">›</span>
    </Link>
  );
}

function initialsFor(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "S";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 21h4" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
