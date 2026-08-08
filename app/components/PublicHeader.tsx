"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { Logo } from "./Logo";

type ActiveMenu = "products" | "solutions" | null;

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMouseEnter = (menu: ActiveMenu) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveMenu(menu);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 150);
  };

  return (
    <header
      className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/90 backdrop-blur-lg shadow-sm"
      onMouseLeave={handleMouseLeave}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo variant="dark" priority />

        {/* Desktop Navigation Row */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          {/* Products Mega Menu Trigger */}
          <div
            className="relative py-4"
            onMouseEnter={() => handleMouseEnter("products")}
          >
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "products" ? null : "products"))}
              className={`inline-flex items-center gap-1.5 font-sx-sans text-[14px] font-semibold transition-colors ${
                activeMenu === "products" ? "text-sx-accent" : "text-sx-text-muted hover:text-sx-accent"
              }`}
            >
              Products <span className="text-[10px] transition-transform duration-200">▼</span>
            </button>
          </div>

          {/* Solutions Mega Menu Trigger */}
          <div
            className="relative py-4"
            onMouseEnter={() => handleMouseEnter("solutions")}
          >
            <button
              type="button"
              onClick={() => setActiveMenu((prev) => (prev === "solutions" ? null : "solutions"))}
              className={`inline-flex items-center gap-1.5 font-sx-sans text-[14px] font-semibold transition-colors ${
                activeMenu === "solutions" ? "text-sx-accent" : "text-sx-text-muted hover:text-sx-accent"
              }`}
            >
              Solutions <span className="text-[10px] transition-transform duration-200">▼</span>
            </button>
          </div>

          <Link href="/how-it-works" className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent">
            How it works
          </Link>

          <Link href="/pricing" className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent">
            Pricing
          </Link>

          <Link href="/audit" className="font-sx-sans text-[14px] font-bold text-sx-accent transition-colors hover:text-sx-accent/80">
            Business Audit
          </Link>

          <Link href="/security" className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent">
            Security
          </Link>
        </nav>

        {/* Right-Side Desktop Actions */}
        <div className="hidden items-center gap-4 lg:flex">
          <Link
            href="/login"
            className="rounded-sx-sm px-3.5 py-2 font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-text"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-sx-sm bg-sx-accent px-5 py-2.5 font-sx-sans text-[14px] font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Start with Stratxcel
          </Link>
        </div>

        {/* Mobile Hamburger Trigger */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text lg:hidden"
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

      {/* FULL-WIDTH ANCHORED DESKTOP MEGA MENUS (PREVENTS ANY CLIPPING DEFECT) */}
      {activeMenu && (
        <div
          className="absolute top-full left-0 right-0 z-50 w-full border-b border-sx-border bg-sx-surface-1 shadow-2xl transition-all duration-200"
          onMouseEnter={() => handleMouseEnter(activeMenu)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {activeMenu === "products" && (
              <div className="grid grid-cols-4 gap-8">
                <div>
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent mb-3">
                    Operate & Control
                  </p>
                  <ul className="space-y-2.5 text-sm font-sx-sans">
                    <li><Link href="/app/billing" onClick={() => setActiveMenu(null)} className="font-bold text-sx-text hover:text-sx-accent">Stratxcel Workspace</Link></li>
                    <li><Link href="/app/copilot" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">AI Copilot Engine</Link></li>
                    <li><Link href="/app/approvals" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Missions & Approvals</Link></li>
                    <li><Link href="/app/brand" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Brand Brain</Link></li>
                  </ul>
                </div>

                <div>
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent mb-3">
                    Market & Publish
                  </p>
                  <ul className="space-y-2.5 text-sm font-sx-sans">
                    <li><Link href="/app/content/studio" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Content Studio</Link></li>
                    <li><Link href="/social-autopilot" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Social Autopilot</Link></li>
                    <li><Link href="/app/content/calendar" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Content Calendar</Link></li>
                    <li><Link href="/app/ads" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Ads & Campaigns</Link></li>
                  </ul>
                </div>

                <div>
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent mb-3">
                    Sell & Serve
                  </p>
                  <ul className="space-y-2.5 text-sm font-sx-sans">
                    <li><Link href="/app/crm" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">CRM Pipeline</Link></li>
                    <li><Link href="/app/content/inbox" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">WhatsApp Inbox</Link></li>
                    <li><Link href="/app/conversations" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-text">Customer Conversations</Link></li>
                  </ul>
                </div>

                <div className="rounded-sx-md bg-sx-surface-2 p-5 text-sx-text flex flex-col justify-between border border-sx-border shadow-xl">
                  <div>
                    <span className="font-sx-mono text-[10px] font-bold uppercase tracking-widest text-sx-accent">
                      Product Walkthrough
                    </span>
                    <h4 className="mt-2 font-sx-sans text-base font-bold text-sx-text">
                      Explore the Operating System
                    </h4>
                    <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                      Guided tour through Starter, Growth and Advanced workflows.
                    </p>
                  </div>
                  <Link
                    href="/experience"
                    onClick={() => setActiveMenu(null)}
                    className="mt-4 inline-block rounded-sx-sm bg-sx-accent px-4 py-2 text-center font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Launch Product Tour →
                  </Link>
                </div>
              </div>
            )}

            {activeMenu === "solutions" && (
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent mb-3">
                    By Business Goal
                  </p>
                  <ul className="space-y-2.5 text-sm font-sx-sans">
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Get More Qualified Leads</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Improve Social Content Consistency</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Automate WhatsApp Lead Follow-up</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Launch High-Converting Website</Link></li>
                  </ul>
                </div>

                <div>
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent mb-3">
                    By Sector
                  </p>
                  <ul className="space-y-2.5 text-sm font-sx-sans">
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Local & Retail Businesses</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Professional Services & Clinics</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Real Estate & Developers</Link></li>
                    <li><Link href="/use-cases" onClick={() => setActiveMenu(null)} className="text-sx-text-muted hover:text-sx-accent">Healthcare & Wellness Studios</Link></li>
                  </ul>
                </div>

                <div className="rounded-sx-md bg-sx-surface-2 p-5 text-sx-text border border-sx-border flex flex-col justify-between">
                  <div>
                    <span className="font-sx-mono text-[10px] font-bold uppercase tracking-widest text-sx-accent">
                      AI Business Audit
                    </span>
                    <h4 className="mt-2 font-sx-sans text-base font-bold text-sx-text">
                      Get Your Growth Roadmap
                    </h4>
                    <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                      Analyze your brand, competitors, and lead channels.
                    </p>
                  </div>
                  <Link
                    href="/audit"
                    onClick={() => setActiveMenu(null)}
                    className="mt-4 inline-block rounded-sx-sm bg-sx-accent px-4 py-2 text-center font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                  >
                    Start Business Audit →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-sx-bg lg:hidden" role="dialog" aria-modal="true">
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

          <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6" aria-label="Mobile Navigation">
            <Link href="/experience" onClick={() => setOpen(false)} className="rounded-sx-sm bg-sx-accent/10 border border-sx-accent/30 p-3.5 font-sx-sans text-sm font-bold text-sx-accent">
              Interactive Product Tour →
            </Link>

            <Link href="/audit" onClick={() => setOpen(false)} className="rounded-sx-sm border border-sx-border bg-sx-surface-1 p-3.5 font-sx-sans text-sm font-bold text-sx-text">
              Business Growth Audit
            </Link>

            <Link href="/pricing" onClick={() => setOpen(false)} className="rounded-sx-sm p-3.5 font-sx-sans text-sm font-semibold text-sx-text border border-sx-border">
              Pricing & Plans
            </Link>

            <Link href="/how-it-works" onClick={() => setOpen(false)} className="rounded-sx-sm p-3.5 font-sx-sans text-sm font-semibold text-sx-text border border-sx-border">
              How it works
            </Link>

            <Link href="/use-cases" onClick={() => setOpen(false)} className="rounded-sx-sm p-3.5 font-sx-sans text-sm font-semibold text-sx-text border border-sx-border">
              Use Cases & Solutions
            </Link>

            <Link href="/security" onClick={() => setOpen(false)} className="rounded-sx-sm p-3.5 font-sx-sans text-sm font-semibold text-sx-text border border-sx-border">
              Security Architecture
            </Link>
          </nav>

          <div className="flex flex-col gap-3 border-t border-sx-border p-4 sm:p-6">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-sx-sm border border-sx-border-strong px-4 py-3 text-center font-sx-sans text-sm font-semibold text-sx-text"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="rounded-sx-sm bg-sx-accent px-4 py-3 text-center font-sx-sans text-sm font-bold text-sx-accent-on shadow-md"
            >
              Start with Stratxcel
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
