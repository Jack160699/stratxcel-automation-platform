"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const PRIMARY_LINKS: { label: string; href: string }[] = [
  { label: "What Stratxcel does", href: "/modules" },
  { label: "Solutions", href: "/use-cases" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
];

/**
 * Public V1 header — acquisition/trust destinations only.
 * Never links into authenticated /app routes.
 */
export function PublicHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/90 backdrop-blur-lg shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo variant="dark" priority />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
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

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-sx-bg md:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between border-b border-sx-border px-4 sm:px-6">
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
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-sx-sm border border-sx-border p-3.5 font-sx-sans text-sm font-semibold text-sx-text"
              >
                {link.label}
              </Link>
            ))}
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
