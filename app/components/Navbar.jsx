"use client";

import { useEffect, useState } from "react";
import { COLORS, whatsappHref } from "@/lib/constants";
import { Logo } from "./Logo";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-[background,box-shadow,backdrop-filter] duration-300 ${
        scrolled
          ? "border-slate-200/70 bg-white/72 shadow-[0_12px_40px_-18px_rgba(11,18,32,0.12)] backdrop-blur-xl backdrop-saturate-150"
          : "border-slate-200/35 bg-[#F8FAFC]/55 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[3.75rem] sm:gap-6 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-slate-500 lg:gap-9 md:flex">
          <a href="#features" className="transition duration-200 hover:text-[#0B1220]">
            What we do
          </a>
          <a href="#insights" className="transition duration-200 hover:text-[#0B1220]">
            Insights
          </a>
          <a href="#use-cases" className="transition duration-200 hover:text-[#0B1220]">
            Examples
          </a>
          <a href="#whatsapp" className="transition duration-200 hover:text-[#0B1220]">
            Contact
          </a>
        </nav>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-[12px] font-semibold text-white shadow-[0_3px_16px_-4px_rgba(30,58,138,0.45)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:brightness-[1.04] hover:shadow-[0_8px_22px_-8px_rgba(59,130,246,0.42)] active:translate-y-0 sm:px-4"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.brand} 100%)`,
          }}
        >
          Get Started
        </a>
      </div>
    </header>
  );
}
