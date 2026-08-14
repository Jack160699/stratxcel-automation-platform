"use client";

import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export function HomeFinalCta() {
  return (
    <section
      data-home-section="final-cta"
      className="relative isolate overflow-hidden bg-[#06080c] py-24 text-white sm:py-32"
    >
      {/* Background Volumetric Glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_110%,rgb(37_99_235/0.25),transparent_65%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 sx-hero-grain opacity-30" aria-hidden />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-400">
          STRATXCEL AI AGENT
        </p>

        <h2 className="mt-4 font-sx-sans text-[clamp(2rem,4.5vw+0.4rem,3.5rem)] font-bold leading-[1.1] tracking-[-0.035em] text-white">
          Put the digital side of your business
          <span className="block text-white/70">on a coordinated AI operating layer.</span>
        </h2>

        <p className="mx-auto mt-6 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-white/65 sm:text-[18px]">
          Start with complete clarity on your growth opportunities, or explore the specialist workforce operating under the
          Stratxcel AI Agent.
        </p>

        {/* Dual CTA Actions */}
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3.5 sm:flex-row sm:items-center">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="home_final_primary"
            plan="audit"
            className="inline-flex min-h-12 items-center justify-center rounded-sx-sm bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-[0_0_28px_rgba(37,99,235,0.4)] transition-all duration-200 hover:brightness-110 motion-reduce:transition-none"
          >
            GET YOUR BUSINESS GROWTH AUDIT — ₹999
          </TrackedCtaLink>
          <TrackedCtaLink
            href="#ai-workforce"
            event="explore_agent"
            surface="home_final_secondary"
            className="inline-flex min-h-12 items-center justify-center rounded-sx-sm border border-white/20 bg-white/[0.05] px-8 py-3.5 font-sx-sans text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/[0.1] motion-reduce:transition-none"
          >
            EXPLORE THE AI AGENT
          </TrackedCtaLink>
        </div>

        {/* Secondary Links */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-white/45">
          <span>₹999 One-time</span>
          <span>•</span>
          <span>No automatic subscription</span>
          <span>•</span>
          <Link href="/security" className="text-white/70 hover:underline">
            Read Security Architecture
          </Link>
          <span>•</span>
          <Link href="/contact?intent=demo" className="text-white/70 hover:underline">
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
