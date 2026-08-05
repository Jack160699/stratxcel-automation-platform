"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/90 backdrop-blur-md"
      onMouseLeave={() => setActiveMenu(null)}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo variant="dark" priority />

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {/* Products Mega Menu Trigger */}
          <div
            className="relative py-4"
            onMouseEnter={() => setActiveMenu("products")}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text focus:outline-none"
            >
              Products <span className="text-[10px]">▼</span>
            </button>

            {activeMenu === "products" && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-[720px] rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl backdrop-blur-xl">
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">Operate</p>
                    <ul className="space-y-2">
                      <li><Link href="/app/billing" className="font-sx-sans font-medium text-sx-text hover:text-sx-accent">Stratxcel Workspace</Link></li>
                      <li><Link href="/app/copilot" className="font-sx-sans text-sx-text-muted hover:text-sx-text">AI Copilot</Link></li>
                      <li><Link href="/app/approvals" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Missions & Approvals</Link></li>
                      <li><Link href="/app/brand" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Brand Brain</Link></li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">Market</p>
                    <ul className="space-y-2">
                      <li><Link href="/app/content/studio" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Content Studio</Link></li>
                      <li><Link href="/social-autopilot" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Social Autopilot</Link></li>
                      <li><Link href="/app/content/calendar" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Content Calendar</Link></li>
                      <li><Link href="/app/ads" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Ads & Campaigns</Link></li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">Sell & Serve</p>
                    <ul className="space-y-2">
                      <li><Link href="/app/crm" className="font-sx-sans text-sx-text-muted hover:text-sx-text">CRM Pipeline</Link></li>
                      <li><Link href="/app/content/inbox" className="font-sx-sans text-sx-text-muted hover:text-sx-text">WhatsApp Inbox</Link></li>
                      <li><Link href="/app/conversations" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Conversations</Link></li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">Build & Measure</p>
                    <ul className="space-y-2">
                      <li><Link href="/app/website" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Website Workspace</Link></li>
                      <li><Link href="/app/content/analytics" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Analytics</Link></li>
                      <li><Link href="/app/reports" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Reports</Link></li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 border-t border-sx-border pt-4 flex items-center justify-between bg-sx-surface-2/60 -mx-6 -mb-6 p-4 rounded-b-sx-lg">
                  <div className="text-xs">
                    <span className="font-bold text-sx-text">Explore the Product Experience</span>
                    <p className="text-[11px] text-sx-text-muted">Take a guided tour through Starter, Growth and Advanced workflows.</p>
                  </div>
                  <Link href="/experience" className="rounded-sx-sm bg-sx-accent px-3.5 py-1.5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]">
                    Launch Product Tour →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Solutions Mega Menu Trigger */}
          <div
            className="relative py-4"
            onMouseEnter={() => setActiveMenu("solutions")}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text focus:outline-none"
            >
              Solutions <span className="text-[10px]">▼</span>
            </button>

            {activeMenu === "solutions" && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-[540px] rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-2xl backdrop-blur-xl">
                <div className="grid grid-cols-2 gap-6 text-xs">
                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">By Business Goal</p>
                    <ul className="space-y-2">
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Get More Qualified Leads</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Improve Social Content Consistency</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Automate WhatsApp Lead Follow-up</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Launch High-Converting 5-Page Website</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Scale Meta & Search Ad Campaigns</Link></li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent mb-2">By Sector</p>
                    <ul className="space-y-2">
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Local & Retail Businesses</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Professional Services & Clinics</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Real Estate & Developers</Link></li>
                      <li><Link href="/use-cases" className="font-sx-sans text-sx-text-muted hover:text-sx-text">Healthcare & Wellness Studios</Link></li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Link href="/how-it-works" className="font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text">
            How it works
          </Link>

          <Link href="/pricing" className="font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text">
            Pricing
          </Link>

          <Link href="/audit" className="font-sx-sans text-[13px] font-semibold text-sx-accent transition-colors hover:text-sx-accent/80">
            Growth Audit (₹999)
          </Link>

          <Link href="/security" className="font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text">
            Security
          </Link>
        </nav>

        {/* Auth CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-sx-sm px-3 py-1.5 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:text-sx-text"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-sx-sm bg-sx-accent px-4 py-2 font-sx-sans text-[13px] font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Start with Stratxcel
          </Link>
        </div>

        {/* Mobile Hamburger Trigger */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <span className="text-xl leading-none">×</span>
          ) : (
            <span className="flex flex-col gap-1" aria-hidden>
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
            </span>
          )}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-sx-bg md:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 border-b border-sx-border">
            <Logo variant="dark" />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-6" aria-label="Mobile Navigation">
            <Link href="/experience" onClick={() => setOpen(false)} className="rounded-sx-sm bg-sx-accent/10 border border-sx-accent/30 p-3 font-sx-sans text-sm font-bold text-sx-accent">
              🎮 Interactive Product Tour →
            </Link>

            <Link href="/audit" onClick={() => setOpen(false)} className="rounded-sx-sm border border-sx-border bg-sx-surface-1 p-3 font-sx-sans text-sm font-bold text-sx-text">
              📊 Business Growth Audit (₹999)
            </Link>

            <Link href="/pricing" onClick={() => setOpen(false)} className="rounded-sx-sm p-3 font-sx-sans text-sm font-medium text-sx-text border border-sx-border">
              💳 Pricing & Plans
            </Link>

            <Link href="/how-it-works" onClick={() => setOpen(false)} className="rounded-sx-sm p-3 font-sx-sans text-sm font-medium text-sx-text border border-sx-border">
              ⚙️ How it works
            </Link>

            <Link href="/use-cases" onClick={() => setOpen(false)} className="rounded-sx-sm p-3 font-sx-sans text-sm font-medium text-sx-text border border-sx-border">
              🎯 Use Cases & Solutions
            </Link>

            <Link href="/security" onClick={() => setOpen(false)} className="rounded-sx-sm p-3 font-sx-sans text-sm font-medium text-sx-text border border-sx-border">
              🔒 Security & Tenancy
            </Link>
          </nav>

          <div className="flex flex-col gap-2.5 border-t border-sx-border p-4 sm:p-6">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-sx-sm border border-sx-border-strong px-4 py-2.5 text-center font-sx-sans text-sm font-medium text-sx-text"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="rounded-sx-sm bg-sx-accent px-4 py-2.5 text-center font-sx-sans text-sm font-bold text-sx-accent-on"
            >
              Start with Stratxcel
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
