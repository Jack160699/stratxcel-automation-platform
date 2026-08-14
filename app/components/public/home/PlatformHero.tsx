"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { useInView } from "@/lib/motion/useInView";
import { HeroMediaLayer } from "./hero/HeroMediaLayer";
import { HeroConvergenceVisual } from "./hero/HeroConvergenceVisual";
import { KineticHeadline } from "./hero/KineticHeadline";
import type { HeroSceneKey } from "./hero/hero-phrases";

export function PlatformHero() {
  const [, setScene] = useState<HeroSceneKey>("grow");
  const [sectionRef, inView] = useInView<HTMLElement>({ threshold: 0.15, once: false });

  const handleSceneChange = useCallback((next: HeroSceneKey) => setScene(next), []);

  return (
    <section
      ref={sectionRef}
      id="platform-hero"
      data-home-section="platform-hero"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#06080c] text-white"
    >
      {/* Volumetric Depth & Atmospheric Lighting Layer */}
      <HeroMediaLayer>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_15%,rgb(37_99_235/0.2),transparent_65%)]" />
        <div className="sx-hero-light-drift absolute -left-[16%] top-[6%] h-[55%] w-[55%] rounded-full bg-[radial-gradient(circle,rgb(58_160_255/0.12),transparent_70%)] blur-3xl" />
        <div className="sx-hero-light-drift-reverse absolute -right-[12%] top-[35%] h-[48%] w-[48%] rounded-full bg-[radial-gradient(circle,rgb(79_220_229/0.08),transparent_70%)] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 sx-hero-vignette" />
        <div className="pointer-events-none absolute inset-0 sx-hero-grain opacity-40" />
      </HeroMediaLayer>

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-[max(4.5rem,10vh)] pt-24 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32">
        <div className="mx-auto w-full max-w-4xl text-center">
          {/* Eyebrow / Kicker */}
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3.5 py-1 text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
              STRATXCEL AI AGENT
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="mt-5 font-sx-sans text-[clamp(2.1rem,5.6vw+0.4rem,4.2rem)] font-bold leading-[1.05] tracking-[-0.04em] text-white">
            <span className="block text-white">YOUR AI BUSINESS AGENT.</span>
            <span className="mt-2 flex flex-wrap items-center justify-center gap-x-3 text-[clamp(1.5rem,4.2vw+0.2rem,3.2rem)] font-semibold text-white/70">
              <span>Built to help you</span>
              <KineticHeadline onSceneChange={handleSceneChange} paused={!inView} />
            </span>
          </h1>

          {/* Supporting Copy */}
          <p className="mx-auto mt-6 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-white/70 sm:text-[18px]">
            Connect your business. Your AI Agent operates the digital work that helps it grow.
          </p>

          {/* Direct Clear CTAs */}
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="home_hero_primary"
              plan="audit"
              className="inline-flex min-h-12 items-center justify-center rounded-sx-sm bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-[0_0_28px_rgba(37,99,235,0.4)] transition-all duration-200 hover:brightness-110 motion-reduce:transition-none"
            >
              GET YOUR BUSINESS GROWTH AUDIT — ₹999
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/products"
              event="explore_agent"
              surface="home_hero_secondary"
              className="inline-flex min-h-12 items-center justify-center rounded-sx-sm border border-white/20 bg-white/[0.05] px-7 py-3.5 font-sx-sans text-sm font-semibold text-white/90 backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/[0.1] motion-reduce:transition-none"
            >
              EXPLORE THE AI AGENT
            </TrackedCtaLink>
          </div>

          <p className="mt-3.5 font-sx-sans text-xs text-white/45">
            One-time ₹999 audit · GST included · No subscription starts automatically
          </p>
        </div>

        {/* Business Convergence Visual System */}
        <div className="mt-10 flex-1">
          <HeroConvergenceVisual />
        </div>
      </div>

      {/* Dawn transition to Section 02 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[min(18vh,9rem)]" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06080c]/80 to-[#06080c]" />
        <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-b from-transparent via-[#fafbfc]/60 to-[#fafbfc]" />
        <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[#fafbfc]" />
      </div>
    </section>
  );
}
