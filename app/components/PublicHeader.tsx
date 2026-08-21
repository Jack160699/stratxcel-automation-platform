"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { Logo } from "./Logo";

// Shown directly in the desktop bar — kept to two, so the header stays a
// simple product for a busy business owner, not a SaaS directory.
const PRIMARY_LINKS: { label: string; href: string }[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
];

// Everything else lives one tap behind a single compact "More" menu instead
// of a multi-column mega menu — see AGENTS §2, "do not recreate a
// complicated SaaS navbar".
const SECONDARY_LINKS: { label: string; href: string }[] = [
  { label: "Solutions", href: "/solutions" },
  { label: "Integrations", href: "/integrations" },
  { label: "AI Workforce", href: "/ai-workforce" },
  { label: "Resources", href: "/resources" },
  { label: PUBLIC_CTAS.androidApp.label, href: PUBLIC_CTAS.androidApp.href },
];

type PublicHeaderProps = {
  logoVariant?: "light" | "dark";
  /**
   * Id of a cinematic hero section this header sits on top of. While the hero
   * is still under the header the bar stays transparent; once it scrolls past,
   * the premium light header resolves in.
   */
  overHeroId?: string;
};

export function PublicHeader({ logoVariant = "dark", overHeroId }: PublicHeaderProps) {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [overHero, setOverHero] = useState(Boolean(overHeroId));
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Desktop "More" panel — a single compact affordance for secondary nav
  // (Solutions, Integrations, AI Workforce, Resources) instead of a mega menu.
  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!overHeroId) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = document.getElementById(overHeroId);
      setOverHero(hero ? hero.getBoundingClientRect().bottom > 72 : false);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [overHeroId]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    const closeButton = dialog?.querySelector<HTMLElement>('button[aria-label="Close menu"]');

    document.body.style.overflow = "hidden";
    closeButton?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  return (
    <>
      <header
        className={`${overHeroId ? "fixed inset-x-0 top-0" : "sticky top-0"} z-50 border-b transition-colors duration-500 motion-reduce:transition-none ${
          overHero
            ? "sx-header-over-hero border-transparent bg-transparent"
            : "border-sx-border bg-sx-bg/90 shadow-sm backdrop-blur-lg"
        }`}
        aria-hidden={open || undefined}
        inert={open || undefined}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo variant={overHero ? "dark" : logoVariant} priority />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent"
              >
                {link.label}
              </Link>
            ))}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                className="flex items-center gap-1 font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                aria-expanded={moreOpen}
                aria-haspopup="true"
                onClick={() => setMoreOpen((v) => !v)}
              >
                More
                <span aria-hidden className={`text-[10px] transition-transform ${moreOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {moreOpen && (
                <div className="sx-public-theme absolute right-0 top-full z-50 mt-2 w-56 rounded-sx-md border border-sx-border bg-sx-bg p-2 shadow-lg">
                  {SECONDARY_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      className="block rounded-sx-sm px-3 py-2 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:bg-sx-surface-2 hover:text-sx-text"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href={PUBLIC_CTAS.signIn.href}
              className="rounded-sx-sm px-3 py-2 text-[13px] font-medium text-sx-text-subtle transition-colors hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.signIn.label}
            </Link>
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="public_header_audit"
              plan="audit"
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3.5 py-2 text-[13px] font-semibold text-sx-text transition-colors hover:bg-sx-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              Start Free Audit
            </TrackedCtaLink>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface={PUBLIC_CTAS.primary.surface}
              className="rounded-sx-sm bg-sx-accent px-4 py-2 text-[13px] font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
          </div>

          {/* Mobile: Log in / Sign up must be visible in the bar itself, not
              hidden inside the hamburger — see AGENTS §2. */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <Link
              href={PUBLIC_CTAS.signIn.href}
              className="rounded-sx-sm px-2 py-1.5 text-[12.5px] font-semibold text-sx-text-subtle transition-colors hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.signIn.label}
            </Link>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface="public_header_mobile_bar"
              className="rounded-sx-sm bg-sx-accent px-3 py-1.5 text-[12.5px] font-bold text-sx-accent-on shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => (open ? closeMenu() : setOpen(true))}
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
        </div>
      </header>

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex flex-col bg-sx-bg lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
        >
          <div className="flex h-16 items-center justify-between border-b border-sx-border px-4 sm:px-6">
            <Logo variant={logoVariant} />
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-6" aria-label="Mobile Navigation">
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-sx-sm border border-sx-border p-4 font-sx-sans text-sm font-semibold text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              >
                {link.label}
              </Link>
            ))}
            <p className="mt-2 px-1 font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-text-subtle">
              More
            </p>
            {SECONDARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-sx-sm border border-sx-border p-4 font-sx-sans text-sm font-semibold text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-3 border-t border-sx-border p-4 sm:p-6">
            <Link
              href={PUBLIC_CTAS.signIn.href}
              onClick={closeMenu}
              className="rounded-sx-sm border border-sx-border-strong px-4 py-3 text-center text-sm font-semibold"
            >
              {PUBLIC_CTAS.signIn.label}
            </Link>
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="public_header_mobile_audit"
              plan="audit"
              onClick={closeMenu}
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-4 py-3 text-center text-sm font-semibold text-sx-text"
            >
              Start Free Audit
            </TrackedCtaLink>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface="public_header_mobile"
              onClick={closeMenu}
              className="rounded-sx-sm bg-sx-accent px-4 py-3 text-center text-sm font-bold text-sx-accent-on"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
          </div>
        </div>
      )}
    </>
  );
}
