"use client";

import { useState } from "react";
import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";
import { LiveAgentSimulation } from "./LiveAgentSimulation";

interface UseCase {
  id: string;
  title: string;
  shortDesc: string;
  primaryAgent: string;
  capabilities: string[];
  workflow: string[];
  ctaText: string;
  ctaHref: string;
}

const USE_CASES: UseCase[] = [
  {
    id: "get-more-customers",
    title: "Get more customers",
    shortDesc: "Turn online discovery and inquiries into qualified leads and closed customers.",
    primaryAgent: "Growth & Sales Agent",
    capabilities: [
      "Targeted search intent capture",
      "WhatsApp automated inquiry routing",
      "Instant lead response & qualification",
      "Custom outreach & proposal generation",
    ],
    workflow: ["Inbound inquiry arrives", "Lead qualified against criteria", "Personalized response drafted", "Owner reviews & approves"],
    ctaText: "See Customer Acquisition Workflows",
    ctaHref: "/solutions",
  },
  {
    id: "improve-seo",
    title: "Improve SEO",
    shortDesc: "Outrank competitors on high-intent search queries with structured research and articles.",
    primaryAgent: "SEO Agent",
    capabilities: [
      "Competitor keyword gap analysis",
      "SERP search intent mapping",
      "Evidence-grounded content briefs",
      "Technical SEO & internal linking audits",
    ],
    workflow: ["Search intent researched", "Keyword map structured", "Article drafted & optimized", "CMS published after sign-off"],
    ctaText: "Explore AI SEO Agent",
    ctaHref: "/ai-seo-agent",
  },
  {
    id: "grow-social",
    title: "Grow social",
    shortDesc: "Maintain a steady, high-performing presence across LinkedIn, Instagram, Facebook, and X.",
    primaryAgent: "Social Agent",
    capabilities: [
      "Weekly multi-channel editorial calendars",
      "Platform-native caption & hook formatting",
      "Brand-aligned visual asset generation",
      "Automated scheduling & engagement telemetry",
    ],
    workflow: ["Weekly themes planned", "Drafts prepared from Brand Brain", "Human reviews batch", "Scheduled to live channels"],
    ctaText: "Explore Social Media Agent",
    ctaHref: "/ai-social-media-agent",
  },
  {
    id: "fix-my-website",
    title: "Fix my website",
    shortDesc: "Transform outdated landing pages into high-speed, high-converting digital storefronts.",
    primaryAgent: "Website Agent",
    capabilities: [
      "Landing page UX & structure architecture",
      "Conversion copy & clear value propositions",
      "Core Web Vitals & mobile optimization",
      "Governed deployment and release checks",
    ],
    workflow: ["Page audit performed", "Layout & copy drafted", "Live preview staged", "Deployed to production domain"],
    ctaText: "Explore AI Website Agent",
    ctaHref: "/ai-website-agent",
  },
  {
    id: "organize-leads",
    title: "Organize leads",
    shortDesc: "Stop losing inquiries in personal WhatsApp chats and unorganized spreadsheets.",
    primaryAgent: "CRM Agent",
    capabilities: [
      "Centralized unified pipeline inbox",
      "Automatic phone number normalization",
      "Custom lifecycle stages & deal tracking",
      "SLA timers & follow-up reminders",
    ],
    workflow: ["Inquiry logged automatically", "Owner assigned to deal", "Stage updated on interaction", "Follow-up reminder set"],
    ctaText: "Explore AI CRM Agent",
    ctaHref: "/ai-crm-agent",
  },
  {
    id: "automate-marketing",
    title: "Automate marketing",
    shortDesc: "Coordinate campaigns, ad creative tests, and multi-channel marketing workflows.",
    primaryAgent: "Marketing & Creative Studio",
    capabilities: [
      "Multi-channel campaign planning",
      "Creative asset generation (Creative Studio)",
      "Ad copy variants & testing briefs",
      "Attribution & return intelligence",
    ],
    workflow: ["Campaign brief defined", "Creative assets generated", "Targeting & copy staged", "Campaign activated on approval"],
    ctaText: "Explore Marketing Automation",
    ctaHref: "/ai-marketing-agent",
  },
  {
    id: "understand-my-business",
    title: "Understand my business",
    shortDesc: "Gain clear, consolidated intelligence across marketing, search, social, and leads.",
    primaryAgent: "Analytics Agent",
    capabilities: [
      "Consolidated cross-channel analytics",
      "Weekly executive performance digests",
      "Competitor landscape tracking",
      "30/60/90-day growth priority roadmaps",
    ],
    workflow: ["Channel telemetry gathered", "Attribution synthesized", "Executive brief compiled", "Priorities delivered to inbox"],
    ctaText: "Start Business Growth Audit — ₹999",
    ctaHref: "/audit",
  },
];

export function HomeUseCaseExplorer() {
  const [activeId, setActiveId] = useState<string>(USE_CASES[0].id);
  const active = USE_CASES.find((u) => u.id === activeId) || USE_CASES[0];

  const handleSelect = (id: string) => {
    setActiveId(id);
    trackFunnel("use_case_selection", { surface: "home_use_cases", choice: id });
  };

  return (
    <section
      id="use-cases"
      data-home-section="use-case-explorer"
      className="relative border-t border-sx-border bg-sx-surface-1 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
            INTERACTIVE USE-CASE EXPLORER
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold tracking-tight text-sx-text">
            What do you want to improve?
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
            Select your immediate business priority to see how the Stratxcel AI Agent coordinates specialist workflows.
          </p>
        </div>

        {/* Explorer Workspace */}
        <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          {/* Left Column: Interactive Selector */}
          <div role="tablist" aria-label="Use Case Priorities" className="flex flex-col space-y-1">
            {USE_CASES.map((uc) => {
              const selected = uc.id === activeId;
              return (
                <button
                  key={uc.id}
                  type="button"
                  role="tab"
                  id={`tab-${uc.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${uc.id}`}
                  onClick={() => handleSelect(uc.id)}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${
                    selected
                      ? "border-sx-accent bg-sx-bg shadow-sm"
                      : "border-transparent bg-transparent hover:bg-sx-surface-2"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={`font-sx-sans text-[15px] font-bold ${
                        selected ? "text-sx-accent" : "text-sx-text"
                      }`}
                    >
                      {uc.title}
                    </span>
                    <span className="font-sx-mono text-[10px] uppercase text-sx-text-subtle">
                      {uc.primaryAgent}
                    </span>
                  </div>
                  <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">
                    {uc.shortDesc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Column: Detailed Capability & Workflow Panel */}
          <div
            id={`panel-${active.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${active.id}`}
            className="flex flex-col justify-between rounded-2xl border border-sx-border bg-sx-bg p-6 shadow-md sm:p-8"
          >
            <div>
              <div className="flex items-center justify-between border-b border-sx-border pb-4">
                <div>
                  <span className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent">
                    Operating Lead
                  </span>
                  <h3 className="font-sx-sans text-xl font-bold text-sx-text">
                    {active.primaryAgent}
                  </h3>
                </div>
                <span className="rounded-full bg-sx-surface-2 px-3 py-1 font-sx-mono text-[10.5px] font-semibold text-sx-text-muted">
                  Governed Execution
                </span>
              </div>

              {/* Capabilities */}
              <div className="mt-6">
                <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-sx-text-subtle">
                  Included Capabilities
                </p>
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {active.capabilities.map((cap) => (
                    <li key={cap} className="flex items-center gap-2 font-sx-sans text-xs text-sx-text-muted">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600">
                        ✓
                      </span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Workflow Path */}
              <div className="mt-8 rounded-xl border border-sx-border bg-sx-surface-2 p-4">
                <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-text-subtle">
                  Operating Workflow
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {active.workflow.map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className="rounded bg-sx-bg px-2.5 py-1 font-sx-sans text-xs font-semibold text-sx-text shadow-xs">
                        {step}
                      </span>
                      {i < active.workflow.length - 1 && (
                        <span className="text-sx-text-subtle text-xs" aria-hidden>
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-sx-border pt-6">
              <Link
                href={active.ctaHref}
                className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
              >
                {active.ctaText} →
              </Link>
              <Link
                href="/audit"
                className="font-sx-sans text-xs font-semibold text-sx-text-muted hover:text-sx-text underline"
              >
                Or begin with the ₹999 Business Growth Audit
              </Link>
            </div>
          </div>
        </div>

        {/* Live Simulation Section */}
        <div className="mt-16">
          <div className="mb-6 max-w-2xl">
            <h3 className="font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
              Live Agent Simulation
            </h3>
            <p className="mt-1.5 font-sx-sans text-sm text-sx-text-muted">
              Watch how the Stratxcel AI Agent turns real-world digital signals into sequenced, actionable operations.
            </p>
          </div>
          <LiveAgentSimulation />
        </div>
      </div>
    </section>
  );
}
