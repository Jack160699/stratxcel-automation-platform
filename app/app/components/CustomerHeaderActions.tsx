"use client";

import Link from "next/link";
import { useState } from "react";
import type { CustomerPlanSummary } from "@/lib/billing/customer-plan";
import { Modal } from "@/components/ui/Overlay";
import { useTheme } from "@/components/theme/ThemeProvider";
import { signOutAction } from "../actions";

interface CustomerHeaderActionsProps {
  tenantId: string;
  name: string | null;
  email: string;
  plan: CustomerPlanSummary;
  showPlanPrompt: boolean;
  auditOpportunityCount: number | null;
}

export function CustomerHeaderActions({
  tenantId,
  name,
  email,
  plan,
  showPlanPrompt,
  auditOpportunityCount,
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
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        <Link
          href="/app/billing"
          className="hidden min-h-9 items-center rounded-full border border-sx-accent/30 bg-sx-accent/10 px-3 text-xs font-semibold text-sx-accent hover:bg-sx-accent/15 sm:inline-flex"
          aria-label={`Current plan: ${plan.name}. View billing`}
        >
          {plan.name}
        </Link>
        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          aria-label="Notifications"
          className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
        >
          <BellIcon />
        </button>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Open profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sx-royal to-sx-ai text-sm font-bold text-white shadow-sm ring-2 ring-sx-bg"
        >
          {initials}
        </button>
      </div>

      <Modal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications">
        <div className="py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sx-surface-2 text-sx-text-subtle">
            <BellIcon />
          </span>
          <p className="mt-3 text-base font-semibold text-sx-text">You&apos;re all caught up</p>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-sx-text-muted">
            There are no account notifications to show. New product updates will appear here when notification delivery is available.
          </p>
        </div>
      </Modal>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Profile & account">
        <div className="max-h-[min(72vh,42rem)] overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex min-w-0 items-center gap-3 rounded-sx-md bg-sx-surface-2 p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sx-royal to-sx-ai font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-sx-text">{name || "Stratxcel customer"}</p>
              <p className="break-all text-sm text-sx-text-muted">{email}</p>
            </div>
          </div>

          <SheetSection title="Current plan">
            <Link
              href="/app/billing"
              onClick={() => setProfileOpen(false)}
              className="flex min-h-12 items-center justify-between rounded-sx-sm border border-sx-border px-3 hover:bg-sx-surface-2"
            >
              <span>
                <span className="block text-sm font-semibold text-sx-text">{plan.name}</span>
                <span className="block text-xs text-sx-text-muted">{plan.status} · {plan.billingStatus}</span>
              </span>
              <span className="text-sm font-semibold text-sx-accent">Manage plan</span>
            </Link>
          </SheetSection>

          <SheetSection title="Preferences">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Appearance">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  aria-pressed={theme === option}
                  className={`min-h-11 rounded-sx-sm border px-3 text-sm font-medium capitalize ${
                    theme === option ? "border-sx-accent bg-sx-accent/10 text-sx-accent" : "border-sx-border text-sx-text-muted"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </SheetSection>

          <SheetSection title="Security & preferences">
            <SheetLink href="/forgot-password" label="Reset password" onNavigate={() => setProfileOpen(false)} />
            <SheetLink href="/app/settings" label="Account settings" onNavigate={() => setProfileOpen(false)} />
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                setNotificationsOpen(true);
              }}
              className="flex min-h-11 w-full items-center justify-between border-t border-sx-border px-1 text-left text-sm text-sx-text-muted hover:text-sx-text"
            >
              Notifications <span aria-hidden="true">›</span>
            </button>
          </SheetSection>

          <form action={signOutAction} className="mt-5">
            <button type="submit" className="min-h-11 w-full rounded-sx-sm border border-sx-danger/30 text-sm font-semibold text-sx-danger hover:bg-sx-danger/10">
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
