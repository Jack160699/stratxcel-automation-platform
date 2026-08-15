"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { OFFICIAL_LOGO } from "@/lib/brand";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { FluidRibbonsCanvas, OutcomeType } from "@/app/components/public/motion/FluidRibbonsCanvas";
import {
  GlobeIcon,
  SearchIcon,
  DocumentTextIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  ChartBarIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  CheckIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

const OUTCOMES: { word: OutcomeType; subtext: string; color: string }[] = [
  { word: "TIME", subtext: "Automate repetitive daily digital routines", color: "from-blue-600 to-indigo-600" },
  { word: "COST", subtext: "Replace fragmented subscriptions and retainers", color: "from-blue-600 to-cyan-600" },
  { word: "QUALITY", subtext: "Grounded strictly in verified business truth", color: "from-blue-700 to-sky-600" },
  { word: "CUSTOMERS", subtext: "Capture organic search intent and inbound inquiries", color: "from-blue-600 to-blue-800" },
  { word: "FOLLOW-UPS", subtext: "Zero missed WhatsApp chats or web leads", color: "from-indigo-600 to-blue-600" },
  { word: "SALES", subtext: "Turn interest into structured proposals faster", color: "from-blue-600 to-teal-600" },
  { word: "GROWTH", subtext: "Consistent compounding digital presence", color: "from-blue-600 to-sky-500" },
];

interface CapabilityView {
  id: string;
  name: string;
  badge: string;
  icon: React.ReactNode;
  headline: string;
  description: string;
  keyPoints: string[];
  metrics: { label: string; value: string; trend?: string }[];
  liveStatus: string;
}

const CAPABILITY_VIEWS: CapabilityView[] = [
  {
    id: "website",
    name: "Website & UX",
    badge: "SITE & MOBILE",
    icon: <GlobeIcon className="w-4 h-4 text-blue-600" />,
    headline: "Fast, high-converting pages updated without developers.",
    description:
      "Keeps your mobile layouts sharp, fixes broken links, updates service pricing, and ensures fast Core Web Vitals automatically.",
    keyPoints: [
      "Continuous mobile layout & responsive audit",
      "Instant copy and pricing updates staged for approval",
      "Sub-second page load times with asset optimization",
    ],
    metrics: [
      { label: "Core Web Vitals", value: "99 / 100", trend: "+12%" },
      { label: "Average Load Time", value: "0.8s", trend: "Fast" },
      { label: "Mobile Readiness", value: "100%", trend: "Optimal" },
    ],
    liveStatus: "Live Domain Connected",
  },
  {
    id: "seo",
    name: "Google & Search",
    badge: "DISCOVERY",
    icon: <SearchIcon className="w-4 h-4 text-blue-600" />,
    headline: "Get discovered by local and search customers on Google.",
    description:
      "Analyzes top local competitor keyword gaps, audits indexation status, and writes targeted search content to capture real customer demand.",
    keyPoints: [
      "Top 10 competitor keyword gap detection",
      "Google Search Console sitemap & indexation tracking",
      "Structured search content that compounds over time",
    ],
    metrics: [
      { label: "Tracked Keywords", value: "+14 Ranked", trend: "Top 5" },
      { label: "Search Visibility", value: "+38.4%", trend: "30-Day" },
      { label: "SERP Competitor Gaps", value: "8 Found", trend: "Targeted" },
    ],
    liveStatus: "GSC Sync Active",
  },
  {
    id: "content",
    name: "Content & Copy",
    badge: "BRAND VOICE",
    icon: <DocumentTextIcon className="w-4 h-4 text-blue-600" />,
    headline: "Compelling articles and marketing copy tailored to your brand.",
    description:
      "Grounded strictly in your business rules and Brand Brain. Produces insightful case studies, service guides, and customer briefs with zero fabricated claims.",
    keyPoints: [
      "Strict Brand Brain guidelines adherence",
      "Zero false claims or unsupported promises",
      "Full human review before any publication",
    ],
    metrics: [
      { label: "Brand Voice Accuracy", value: "100%", trend: "Grounded" },
      { label: "Articles Staged", value: "4 Drafted", trend: "Awaiting Sign-off" },
      { label: "Review Time Saved", value: "6.5 hrs/wk", trend: "Automated" },
    ],
    liveStatus: "Brand Brain Synced",
  },
  {
    id: "social",
    name: "Social Media",
    badge: "CONSISTENCY",
    icon: <ShareNodesIcon className="w-4 h-4 text-blue-600" />,
    headline: "Weekly multi-channel calendars and platform-native captions.",
    description:
      "Maintains your professional presence across LinkedIn, Instagram, Facebook, and Threads without spending hours every week brainstorming posts.",
    keyPoints: [
      "Platform-tailored formatting and hashtags",
      "Visual asset staging with approved templates",
      "1-click calendar approval or scheduled publishing",
    ],
    metrics: [
      { label: "Scheduled Posts", value: "5 This Week", trend: "Multi-Channel" },
      { label: "Active Channels", value: "LinkedIn, IG, FB", trend: "Connected" },
      { label: "Consistency Score", value: "98%", trend: "Active" },
    ],
    liveStatus: "Publishing Queue Ready",
  },
  {
    id: "crm",
    name: "Customer Leads",
    badge: "INQUIRIES & CRM",
    icon: <UsersGroupIcon className="w-4 h-4 text-blue-600" />,
    headline: "Never lose a high-value customer inquiry to slow replies.",
    description:
      "Organizes incoming WhatsApp inquiries, website form fills, and quote requests into a single clean pipeline with intelligent draft responses.",
    keyPoints: [
      "Instant WhatsApp & web lead intake",
      "Automated follow-up reminders and stage tracking",
      "Customer contact normalization and deduplication",
    ],
    metrics: [
      { label: "Inquiries Handled", value: "24 This Week", trend: "100% Routed" },
      { label: "Avg Response Speed", value: "< 2 Mins", trend: "Instant" },
      { label: "Lost Leads", value: "0", trend: "Zero Leakage" },
    ],
    liveStatus: "WhatsApp Bridge Connected",
  },
  {
    id: "analytics",
    name: "Weekly Insights",
    badge: "REPORTING",
    icon: <ChartBarIcon className="w-4 h-4 text-blue-600" />,
    headline: "Clear executive briefings on what is working and what to do next.",
    description:
      "Translates messy web analytics and campaign metrics into plain-English takeaways showing where your traffic and customers actually come from.",
    keyPoints: [
      "Plain-English weekly business digest",
      "Identifies highest-ROI channels and bottlenecks",
      "Actionable 7-day recommendations for your team",
    ],
    metrics: [
      { label: "Pipeline Value", value: "₹4.8L Active", trend: "+22%" },
      { label: "High-Intent Visits", value: "1,420", trend: "+18%" },
      { label: "Executive Digest", value: "Ready (Mon 9 AM)", trend: "Weekly" },
    ],
    liveStatus: "Telemetry Engine Active",
  },
];

export function HomeHeroLight() {
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeId, setActiveId] = useState<string>("website");

  const currentOutcome = OUTCOMES[outcomeIndex];
  const active = CAPABILITY_VIEWS.find((v) => v.id === activeId) || CAPABILITY_VIEWS[0];

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setOutcomeIndex((prev) => (prev + 1) % OUTCOMES.length);
        setIsTransitioning(false);
      }, 350);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="hero"
      data-home-section="hero"
      className="relative overflow-hidden bg-white pt-20 pb-16 sm:pt-28 sm:pb-24"
    >
      {/* Ambient Fluid Ribbons Canvas */}
      <FluidRibbonsCanvas activeOutcome={currentOutcome.word} />

      {/* Gentle Radial Overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[10%] left-1/2 h-[50vw] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.06),transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000003_1px,transparent_1px),linear-gradient(to_bottom,#00000003_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Headline & Outcome Cycling */}
        <div className="mx-auto max-w-4xl text-center">
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

          {/* Primary Fixed Hero Sentences with Dynamic Outcome Word */}
          <div className="mt-7">
            <p className="font-sx-sans text-[clamp(1.8rem,4vw,3.2rem)] font-bold tracking-tight text-slate-900 leading-tight">
              You run your business.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-sx-sans text-[clamp(1.8rem,4vw,3.2rem)] font-bold tracking-tight text-slate-900 leading-tight">
              <span>We help you get more on</span>
              <span
                className={`inline-block min-w-[5ch] text-left transition-all duration-300 ${
                  isTransitioning
                    ? "opacity-0 -translate-y-2 blur-xs scale-95"
                    : "opacity-100 translate-y-0 blur-none scale-100"
                }`}
              >
                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 bg-clip-text text-transparent underline decoration-blue-400/40 decoration-4 underline-offset-8">
                  {currentOutcome.word}
                </span>
              </span>
            </div>
          </div>

          {/* Supporting Core Message */}
          <p className="mx-auto mt-6 max-w-2xl font-sx-sans text-base sm:text-lg leading-relaxed text-slate-600 font-medium">
            Stratxcel helps plan, create, manage and improve the digital work behind your business.
          </p>

          {/* Primary and Secondary Hero CTAs */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="home_hero_primary"
              plan="audit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg sm:w-auto"
            >
              <span>START MY ₹999 BUSINESS AUDIT</span>
              <ArrowRightIcon className="ml-2 w-4 h-4" />
            </TrackedCtaLink>

            <a
              href="#how-it-works"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 font-sx-sans text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400 sm:w-auto"
            >
              SEE HOW IT WORKS
            </a>
          </div>

          <p className="mt-3.5 font-sx-sans text-xs text-slate-500 font-medium">
            ₹999 one-time · GST included · No automatic subscription · Complete 30/60/90-day roadmap
          </p>
        </div>

        {/* Living SaaS Workstation Window */}
        <div className="mt-14 sm:mt-18">
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
                  <span>https://agent.stratxcel.in/workspace/live</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {active.liveStatus}
                </span>
                <span className="hidden md:inline-block font-sx-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Human Approval Active
                </span>
              </div>
            </div>

            {/* Interactive Capability Switcher Tabs */}
            <div className="border-b border-slate-200/80 bg-slate-50/50 p-2 sm:px-6">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {CAPABILITY_VIEWS.map((tab) => {
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
                      <span>{tab.icon}</span>
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Living Showcase Body */}
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
              {/* Left Column: Context & Key Deliverables */}
              <div>
                <span className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-blue-600">
                  {active.badge}
                </span>

                <h2 className="mt-2 font-sx-sans text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                  {active.headline}
                </h2>

                <p className="mt-3 font-sx-sans text-sm leading-relaxed text-slate-600">
                  {active.description}
                </p>

                {/* Key Points Checklist */}
                <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-5">
                  {active.keyPoints.map((point) => (
                    <div key={point} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">
                        <CheckIcon className="w-3 h-3 text-blue-700" />
                      </span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-7 flex items-center gap-4">
                  <TrackedCtaLink
                    href="/audit"
                    event="start_audit"
                    surface="hero_showcase_inline"
                    plan="audit"
                    className="inline-flex items-center gap-1.5 font-sx-sans text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-800"
                  >
                    <span>Audit your {active.name.toLowerCase()} in the ₹999 Growth Audit</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </TrackedCtaLink>
                </div>
              </div>

              {/* Right Column: Dynamic Live Telemetry Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 relative">
                      <Image
                        src={OFFICIAL_LOGO.src}
                        alt="Stratxcel"
                        width={OFFICIAL_LOGO.width}
                        height={OFFICIAL_LOGO.height}
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <span className="font-sx-mono text-xs font-bold text-slate-800">
                      LIVE OPERATING STATUS
                    </span>
                  </div>
                  <span className="rounded bg-blue-100 text-blue-800 font-mono text-[10px] font-bold px-2 py-0.5 uppercase">
                    Autonomous Guard Active
                  </span>
                </div>

                {/* 3 Metric Tiles */}
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  {active.metrics.map((m) => (
                    <div key={m.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="font-sx-mono text-[9px] uppercase tracking-wider text-slate-500 truncate">
                        {m.label}
                      </p>
                      <p className="mt-1 font-sx-sans text-sm font-bold text-slate-900 truncate">
                        {m.value}
                      </p>
                      {m.trend && (
                        <span className="mt-1 inline-block rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-700">
                          {m.trend}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Micro Action Terminal / Simulation */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Recent Agent Action</span>
                    <span className="text-emerald-600 font-semibold">Verified Safe</span>
                  </div>
                  <p className="font-sans text-slate-800 text-xs leading-relaxed">
                    Staged review draft for your approval. No changes go live without your confirmation.
                  </p>
                </div>
              </div>
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
