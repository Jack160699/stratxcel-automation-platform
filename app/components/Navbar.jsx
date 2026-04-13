"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COLORS, STRATXCEL_APP_URL, whatsappHref } from "@/lib/constants";
import { mainNav } from "@/lib/site-nav";
import { Logo } from "./Logo";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const linkClass =
    "rounded-md text-[13px] font-medium text-slate-500 transition-colors duration-200 ease-out hover:text-[#0B1220] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC]";

  return (
    <header
      className={`sticky top-0 border-b transition-[background-color,box-shadow,backdrop-filter,border-color] duration-200 ease-out ${
        open ? "z-[70]" : "z-50"
      } ${
        scrolled
          ? "border-slate-200/70 bg-white/72 shadow-[0_12px_40px_-18px_rgba(11,18,32,0.12)] backdrop-blur-xl backdrop-saturate-150"
          : "border-slate-200/35 bg-[#F8FAFC]/55 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[3.75rem] sm:gap-5 sm:px-6 lg:gap-6 lg:px-8">
        <Logo priority />
        <nav className="hidden items-center gap-6 text-[13px] lg:gap-7 md:flex" aria-label="Primary">
          {mainNav.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
          <a
            href={STRATXCEL_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Stratxcel AI
          </a>
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-sm transition-[transform,background-color,box-shadow] duration-200 ease-out hover:bg-white hover:shadow-md active:scale-[0.97] md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <span className="text-lg leading-none">×</span>
            ) : (
              <span className="flex flex-col gap-1" aria-hidden>
                <span className="block h-0.5 w-4 rounded-full bg-slate-600" />
                <span className="block h-0.5 w-4 rounded-full bg-slate-600" />
                <span className="block h-0.5 w-4 rounded-full bg-slate-600" />
              </span>
            )}
          </button>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-full px-3 text-[12px] font-semibold text-white shadow-[0_3px_16px_-4px_rgba(30,58,138,0.45)] transition-[transform,box-shadow,filter] duration-200 ease-out motion-safe:hover:-translate-y-px hover:brightness-[1.04] hover:shadow-[0_8px_22px_-8px_rgba(59,130,246,0.42)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:px-4"
            style={{
              background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.brand} 100%)`,
            }}
          >
          Get started
        </a>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-[min(100%,19rem)] flex-col gap-1 border-l border-slate-200/80 bg-white/95 py-4 pl-5 pr-6 pt-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 transition-colors duration-200 ease-out hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg py-3 text-[15px] font-medium text-[#0B1220] transition-colors duration-200 ease-out hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={STRATXCEL_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg py-3 text-[15px] font-medium text-[#0B1220] transition-colors duration-200 ease-out hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Stratxcel AI
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
