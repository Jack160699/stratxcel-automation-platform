"use client";

import Link from "next/link";
import { useState } from "react";

interface AgentSpecialist {
  id: string;
  name: string;
  department: string;
  icon: string;
  desc: string;
  handles: string[];
  exampleTask: string;
  route: string;
}

const SPECIALIST_AGENTS: AgentSpecialist[] = [
  {
    id: "seo-agent",
    name: "SEO Agent",
    department: "Discovery & Search",
    icon: "🔍",
    desc: "Researches search intent, audits technical SEO health, and plans keyword-targeted articles to compound discoverability.",
    handles: ["Keyword opportunity maps", "SERP competitor analysis", "Technical on-page audits", "Internal linking architecture"],
    exampleTask: 'Audit top 10 competitor keyword gaps for "B2B SaaS automation" and produce an internal linking blueprint.',
    route: "/ai-seo-agent",
  },
  {
    id: "website-agent",
    name: "Website Agent",
    department: "Web & UX Architecture",
    icon: "🌐",
    desc: "Designs high-converting page structures, writes conversion copy, and coordinates governed deployments under release control.",
    handles: ["Landing page UX structure", "Conversion copy optimization", "Performance & Core Web Vitals", "Deployment safety checks"],
    exampleTask: "Assemble a high-converting pricing page draft with verified proof points and responsive layouts.",
    route: "/ai-website-agent",
  },
  {
    id: "content-agent",
    name: "Content Agent",
    department: "Brand Voice & Copy",
    icon: "✍️",
    desc: "Drafts persuasive copy, articles, and briefs grounded strictly in your Brand Brain guidelines.",
    handles: ["Long-form thought leadership", "Conversion hooks & headlines", "Video scripts & storyboards", "Brand voice enforcement"],
    exampleTask: "Draft a 1,200-word positioning guide referencing our active Brand Brain guidelines with zero hallucinated claims.",
    route: "/ai-content-agent",
  },
  {
    id: "social-agent",
    name: "Social Agent",
    department: "Multi-Platform Distribution",
    icon: "📱",
    desc: "Plans platform-native calendars, crafts tailored captions, schedules posts, and monitors engagement telemetry.",
    handles: ["Weekly content schedules", "Platform-specific caption styles", "Automated queue distribution", "Engagement signal analysis"],
    exampleTask: "Generate and schedule 5 platform-tailored posts across LinkedIn, Instagram, and X for human sign-off.",
    route: "/ai-social-media-agent",
  },
  {
    id: "crm-agent",
    name: "CRM Agent",
    department: "Lead Lifecycle & Pipeline",
    icon: "👥",
    desc: "Captures inbound enquiries, normalizes phone numbers, updates lead stages, and keeps follow-ups from falling through cracks.",
    handles: ["Lead capture & deduplication", "Lifecycle stage progression", "Pipeline data hygiene", "Custom audience segmentation"],
    exampleTask: "Parse WhatsApp and web enquiries into qualified pipeline records and assign follow-up tasks.",
    route: "/ai-crm-agent",
  },
  {
    id: "growth-agent",
    name: "Growth Agent",
    department: "Funnels & Experimentation",
    icon: "🚀",
    desc: "Maps conversion funnels, designs measurable growth experiments, and builds retention playbooks that compound revenue.",
    handles: ["Funnel drop-off diagnosis", "Growth experiment design", "Retention loop playbooks", "Cohort performance tracking"],
    exampleTask: "Identify onboarding drop-off points and design a 3-step reactivation sequence.",
    route: "/ai-business-automation",
  },
  {
    id: "sales-agent",
    name: "Sales Agent",
    department: "Outreach & Proposals",
    icon: "🤝",
    desc: "Crafts personalized outreach sequences, structures commercial proposals, and executes governed CRM mutations.",
    handles: ["Personalized outreach sequences", "Proposal & quote drafts", "Lead qualification criteria", "Sales motion playbooks"],
    exampleTask: "Draft custom proposal briefs for three qualified enterprise leads based on recent CRM context.",
    route: "/ai-marketing-agent",
  },
  {
    id: "analytics-agent",
    name: "Analytics Agent",
    department: "Business Intelligence",
    icon: "📊",
    desc: "Extracts multi-channel attribution insights and provides actionable weekly intelligence briefings.",
    handles: ["Multi-touch attribution", "Executive briefing summaries", "Spend vs. return analysis", "Anomaly & trend detection"],
    exampleTask: "Synthesize weekly traffic, conversion, and pipeline velocity into a 1-page executive action brief.",
    route: "/ai-business-agent",
  },
];

export function HomeAiWorkforce() {
  const [activeTab, setActiveTab] = useState<string>("all");

  return (
    <section
      id="ai-workforce"
      data-home-section="ai-workforce"
      className="relative border-t border-sx-border bg-sx-surface-1 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
            STRATXCEL AI AGENT ECOSYSTEM
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold tracking-tight text-sx-text">
            Your AI Workforce.
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
            Specialist capabilities operating collaboratively under the Stratxcel AI Agent — grounded in your brand,
            constrained by your policies, and waiting for your approval.
          </p>
        </div>

        {/* Agent Cards Grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIALIST_AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="group flex flex-col justify-between rounded-2xl border border-sx-border bg-sx-bg p-6 transition-all duration-200 hover:-translate-y-1 hover:border-sx-accent/40 hover:shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sx-surface-2 text-xl" aria-hidden>
                    {agent.icon}
                  </span>
                  <span className="rounded-full bg-sx-surface-2 px-2.5 py-0.5 font-sx-mono text-[9px] font-bold uppercase text-sx-text-subtle">
                    {agent.department}
                  </span>
                </div>

                <h3 className="mt-4 font-sx-sans text-lg font-bold text-sx-text">
                  {agent.name}
                </h3>
                <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                  {agent.desc}
                </p>

                {/* Handles list */}
                <div className="mt-4 space-y-1.5 border-t border-sx-border pt-4">
                  <p className="font-sx-mono text-[9.5px] font-semibold uppercase tracking-wider text-sx-text-subtle">
                    What it handles
                  </p>
                  <ul className="space-y-1">
                    {agent.handles.map((h) => (
                      <li key={h} className="flex items-center gap-1.5 font-sx-sans text-xs text-sx-text-muted">
                        <span className="text-sx-accent" aria-hidden>•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Example Task */}
                <div className="mt-4 rounded-lg bg-sx-surface-2 p-3">
                  <p className="font-sx-mono text-[9px] font-bold uppercase tracking-wider text-sx-accent">
                    Example Task
                  </p>
                  <p className="mt-1 font-sx-sans text-[12px] italic leading-snug text-sx-text-muted">
                    &ldquo;{agent.exampleTask}&rdquo;
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-sx-border pt-4">
                <Link
                  href={agent.route}
                  className="inline-flex items-center gap-1 font-sx-sans text-xs font-semibold text-sx-accent hover:underline"
                >
                  Explore {agent.name} capabilities <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Global Workforce Banner */}
        <div className="mt-12 rounded-2xl border border-sx-border bg-sx-surface-2 p-6 text-center sm:p-8">
          <p className="font-sx-sans text-base font-semibold text-sx-text sm:text-lg">
            Looking for the full multi-agent operating workforce architecture?
          </p>
          <p className="mx-auto mt-2 max-w-xl font-sx-sans text-sm text-sx-text-muted">
            All specialist agents coordinate over a shared Directed Acyclic Graph (DAG) with unified Brand Brain context.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/ai-workforce"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
            >
              Explore AI Workforce Architecture
            </Link>
            <Link
              href="/audit"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-2.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-3"
            >
              Start with Business Growth Audit — ₹999
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
