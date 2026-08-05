"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const NAV_ITEMS = [
  { label: "Products", href: "/modules" },
  { label: "Solutions", href: "/use-cases" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "About", href: "/about" },
];

/**
 * Public site header — docs/product-design/PUBLIC_WEBSITE_SITEMAP.md's global
 * nav, on the Stratxcel Core token system (sx-*) rather than the immersive
 * "journey" header. "Work" is intentionally omitted until a real, sourced
 * case-study page exists — the sitemap itself says not to link an unpublished
 * Work page. "Sign in" and "Start with Stratxcel" go to the real public
 * /login and /signup routes; "Book demo"-style CTAs stay on
 * /contact?intent=demo since that's a sales conversation, not account
 * creation.
 */
export function PublicHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo variant="dark" priority />

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors duration-150 hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <Link
            href="/login"
            className="rounded-sx-sm px-3 py-1.5 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors duration-150 hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-sx-sm bg-sx-accent px-4 py-2 font-sx-sans text-[13px] font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
          >
            Start with Stratxcel
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <span className="text-lg leading-none">×</span>
          ) : (
            <span className="flex flex-col gap-1" aria-hidden>
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
              <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
            </span>
          )}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-sx-bg md:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <Logo variant="dark" />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pt-2 sm:px-6" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-sx-sm py-3 font-sx-sans text-base font-medium text-sx-text"
              >
                {item.label}
              </Link>
            ))}
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
              className="rounded-sx-sm bg-sx-accent px-4 py-2.5 text-center font-sx-sans text-sm font-semibold text-sx-accent-on"
            >
              Start with Stratxcel
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
