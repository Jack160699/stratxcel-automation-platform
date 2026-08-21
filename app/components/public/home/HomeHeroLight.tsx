"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { FluidRibbonsCanvas, OutcomeType } from "@/app/components/public/motion/FluidRibbonsCanvas";
import { LockClosedIcon, ShieldCheckIcon, ArrowRightIcon } from "../icons/FeatureIcons";

const OUTCOMES: { phrase: OutcomeType; subtext: string }[] = [
  { phrase: "MORE TIME", subtext: "Automate repetitive daily digital routines" },
  { phrase: "LOWER COSTS", subtext: "Replace fragmented subscriptions and retainers" },
  { phrase: "BETTER QUALITY", subtext: "Grounded strictly in verified business truth" },
  { phrase: "MORE CUSTOMERS", subtext: "Capture organic search intent and inbound inquiries" },
  { phrase: "BETTER FOLLOW-UPS", subtext: "Zero missed WhatsApp chats or web leads" },
  { phrase: "MORE SALES", subtext: "Turn interest into structured proposals faster" },
  { phrase: "FASTER GROWTH", subtext: "Consistent compounding digital presence" },
];

// Real product screenshots — same screens shown in HomeProductEvidence. No
// invented dashboards, metrics, or telemetry: what you see here is what the
// app actually renders. See AGENTS §4/§6/§10.
interface HeroScreen {
  id: string;
  step: string;
  label: string;
  src: string;
  alt: string;
  caption: string;
}

const HERO_SCREENS: HeroScreen[] = [
  {
    id: "audit",
    step: "1. AUDIT",
    label: "Free Audit",
    src: "/product-evidence/01-free-audit.png",
    alt: "Starting a free Stratxcel business audit",
    caption: "Tell us your website or Google Business link — that's enough to start.",
  },
  {
    id: "findings",
    step: "2. UNDERSTAND",
    label: "Findings",
    src: "/product-evidence/02-audit-findings.png",
    alt: "Stratxcel audit findings and growth diagnosis",
    caption: "An evidence-backed diagnosis of your online presence, in plain language.",
  },
  {
    id: "profile",
    step: "3. UNDERSTAND",
    label: "Business Profile",
    src: "/product-evidence/03-business-profile.png",
    alt: "Confirming business and brand details in Stratxcel",
    caption: "Confirm your business details once — Stratxcel reuses them everywhere.",
  },
  {
    id: "connected",
    step: "4. CONNECT",
    label: "Connected Accounts",
    src: "/product-evidence/04-connected-accounts.png",
    alt: "Connecting business accounts in Stratxcel",
    caption: "Connect the accounts you already use, or skip and add them later.",
  },
];

export function HomeHeroLight() {
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeId, setActiveId] = useState<string>(HERO_SCREENS[0].id);

  const currentOutcome = OUTCOMES[outcomeIndex];
  const active = HERO_SCREENS.find((v) => v.id === activeId) || HERO_SCREENS[0];

  useEffect(() => {
    // 3500ms total loop: 2400ms hold + 550ms transition
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setOutcomeIndex((prev) => (prev + 1) % OUTCOMES.length);
        setIsTransitioning(false);
      }, 550);
    }, 3400);

    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="hero"
      data-home-section="hero"
      className="relative overflow-hidden bg-white pt-16 pb-16 sm:pt-24 sm:pb-24"
    >
      {/* Ambient Diagonal Translucent Bands Canvas (Quiet Zone Center) */}
      <FluidRibbonsCanvas activeOutcome={currentOutcome.phrase} />

      {/* Gentle Radial Overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[10%] left-1/2 h-[45vw] w-[65vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.035),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Headline Container: Left-aligned on mobile, Centered on desktop */}
        <div className="mx-auto max-w-4xl text-left sm:text-center flex flex-col items-start sm:items-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-blue-50/90 px-4 py-1.5 text-blue-700 shadow-xs backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
            </span>
            <span className="font-sx-mono text-xs font-bold uppercase tracking-[0.18em]">
              STRATXCEL AI AGENT
            </span>
          </div>

          {/* Primary Fixed Hero Headline: Strictly 2 lines on desktop/laptop */}
          <div className="mt-6 sm:mt-7 w-full">
            {/* Line 1: Stable Single Line */}
            <h1 className="font-sx-sans text-[clamp(1.85rem,4.2vw,3.25rem)] font-bold tracking-tight text-slate-900 leading-tight">
              You run your business.
            </h1>

            {/* Line 2: Fixed Visual Slot — Strictly 1 line on desktop, clean on mobile */}
            <div className="mt-1.5 sm:mt-2 flex flex-wrap sm:flex-nowrap items-baseline sm:items-center justify-start sm:justify-center gap-x-2.5 sm:gap-x-3 font-sx-sans text-[clamp(1.6rem,3.8vw,3.15rem)] font-bold tracking-tight text-slate-900 leading-tight whitespace-normal sm:whitespace-nowrap">
              <span className="whitespace-nowrap shrink-0">We help you get</span>

              {/* Reserved Invariant Slot Container for Dynamic Outcome */}
              <div
                id="outcome-container"
                className="relative inline-flex items-center justify-start overflow-visible whitespace-nowrap min-w-[13ch] sm:min-w-[15ch] h-[1.3em] align-middle text-left"
                aria-live="polite"
              >
                <span
                  key={currentOutcome.phrase}
                  className={`inline-block whitespace-nowrap transition-all duration-500 ease-out ${
                    isTransitioning
                      ? "opacity-0 -translate-y-1.5 blur-[2px] scale-[0.98]"
                      : "opacity-100 translate-y-0 blur-none scale-100"
                  }`}
                >
                  <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 bg-clip-text text-transparent underline decoration-blue-400/40 decoration-4 underline-offset-8">
                    {currentOutcome.phrase}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Supporting Core Message */}
          <p className="mt-5 sm:mt-6 max-w-2xl font-sx-sans text-base sm:text-lg leading-relaxed text-slate-600 font-medium text-left sm:text-center mx-0 sm:mx-auto">
            Stratxcel helps with the digital work behind your business, so you can focus on running it.
          </p>

          {/* Primary and Secondary Hero CTAs */}
          <div className="mt-8 sm:mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-start sm:justify-center gap-3.5 sm:gap-4 w-full sm:w-auto">
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="home_hero_primary"
              plan="audit"
              className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
            >
              <span>START FREE AUDIT</span>
              <ArrowRightIcon className="ml-2 w-4 h-4" />
            </TrackedCtaLink>

            <a
              href="#how-it-works"
              className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 font-sx-sans text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400"
            >
              SEE HOW IT WORKS
            </a>
          </div>

          <p className="mt-3.5 font-sx-sans text-xs text-slate-500 font-medium text-left sm:text-center">
            100% Free · Evidence-backed website &amp; presence analysis · Complete 30/60/90-day roadmap
          </p>
        </div>

        {/* Real Product Screenshots — Audit → Understand → Connect */}
        <div className="mt-12 sm:mt-18">
          <div className="relative mx-auto max-w-5xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-200/60 overflow-hidden">
            {/* Window Chrome Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/90 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                </div>
                <div className="ml-3 hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 font-mono">
                  <LockClosedIcon className="w-3 h-3 text-emerald-600" />
                  <span>app.stratxcel.in</span>
                </div>
              </div>
              <span className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
                {active.step}
              </span>
            </div>

            {/* Screen Switcher Tabs */}
            <div className="border-b border-slate-200/80 bg-slate-50/50 p-2 sm:px-6">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {HERO_SCREENS.map((tab) => {
                  const isSelected = tab.id === activeId;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveId(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real Screenshot */}
            <div className="relative aspect-[16/10] w-full bg-slate-100 sm:aspect-[16/9.5]">
              <Image
                key={active.id}
                src={active.src}
                alt={active.alt}
                fill
                sizes="(min-width: 1024px) 960px, 100vw"
                className="object-cover object-top"
                priority={active.id === HERO_SCREENS[0].id}
              />
            </div>

            {/* Caption */}
            <div className="border-t border-slate-200/80 bg-white px-6 py-4 text-sm text-slate-700 sm:px-8">
              {active.caption}
            </div>

            {/* Bottom Guarantee Banner */}
            <div className="border-t border-slate-200/80 bg-slate-50/50 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-4 h-4 text-blue-600" />
                <span>Tenant Isolated: Your data is never shared with third parties.</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" />
                <span>Zero Hallucination Guard: Grounded strictly in your business profile.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
