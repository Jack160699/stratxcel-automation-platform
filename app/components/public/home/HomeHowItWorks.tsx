"use client";

import Link from "next/link";

const STEPS = [
  {
    step: "01",
    label: "CONNECT",
    title: "Connect approved business platforms",
    desc: "Authorize your website, Google, Meta, WhatsApp, CRM, or analytics through scoped, tenant-isolated connectors. Your credentials and assets stay yours.",
    tags: ["OAuth Grants", "Tenant Isolated", "Scoped Access"],
  },
  {
    step: "02",
    label: "UNDERSTAND",
    title: "Stratxcel learns your business context",
    desc: "The AI Agent ingests your positioning, brand voice (Brand Brain), target audience, competitor signals, and operating rules to ground every decision in reality.",
    tags: ["Brand Brain", "Audience Slices", "Competitor Signals"],
  },
  {
    step: "03",
    label: "WORK",
    title: "Specialist AI agents execute approved workflows",
    desc: "Coordinated specialist agents plan, draft, and stage execution across SEO, website, content, social, outreach, and CRM — waiting for human sign-off on high-stake actions.",
    tags: ["Multi-Agent DAG", "Human Checkpoints", "Zero Hallucination"],
  },
  {
    step: "04",
    label: "IMPROVE",
    title: "Results feed back and inform future moves",
    desc: "Performance telemetry and lead outcomes automatically cycle back into memory, refining recommendations and compounding your digital business growth.",
    tags: ["Telemetry Loops", "Closed Feedback", "Compounding Gains"],
  },
];

const FLOW_NODES = [
  { name: "YOUR BUSINESS", role: "Source Context" },
  { name: "STRATXCEL AI AGENT", role: "Operating Core" },
  { name: "AI WORKFORCE", role: "Specialist Execution" },
  { name: "ACTIONS", role: "Governed Work" },
  { name: "RESULTS", role: "Measurable Impact" },
  { name: "LEARNING", role: "Feedback Loop" },
];

export function HomeHowItWorks() {
  return (
    <section
      id="how-it-works"
      data-home-section="how-it-works"
      className="relative border-t border-sx-border bg-sx-bg py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
            OPERATING ARCHITECTURE
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold tracking-tight text-sx-text">
            How the Stratxcel AI Agent operates your digital work.
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
            A clear 4-step loop from connected systems to accountable growth — with you in full control.
          </p>
        </div>

        {/* Visual Operating Flow Diagram */}
        <div className="mt-14 overflow-hidden rounded-2xl border border-sx-border bg-sx-surface-1 p-6 shadow-[var(--sx-public-shadow-sm)] sm:p-8">
          <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.2em] text-sx-text-subtle">
            End-to-End System Flow
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:gap-2">
            {FLOW_NODES.map((node, i) => (
              <div key={node.name} className="flex flex-1 min-w-[130px] items-center gap-2">
                <div className="flex-1 rounded-xl border border-sx-border bg-sx-surface-2 p-3 text-center transition-colors hover:border-sx-accent/40">
                  <span className="block font-sx-mono text-[9.5px] uppercase tracking-wider text-sx-accent">
                    {node.role}
                  </span>
                  <span className="mt-1 block font-sx-sans text-xs font-bold text-sx-text sm:text-[13px]">
                    {node.name}
                  </span>
                </div>
                {i < FLOW_NODES.length - 1 && (
                  <span className="hidden text-sx-text-subtle lg:inline" aria-hidden>
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 4 Steps Grid */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.step}
              className="flex flex-col justify-between rounded-2xl border border-sx-border bg-sx-surface-1 p-6 transition-all duration-200 hover:border-sx-border-strong hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-sx-mono text-2xl font-bold tracking-tight text-sx-accent">
                    {step.step}
                  </span>
                  <span className="rounded-full bg-sx-surface-2 px-2.5 py-0.5 font-sx-mono text-[10px] font-bold uppercase text-sx-text-muted">
                    {step.label}
                  </span>
                </div>
                <h3 className="mt-4 font-sx-sans text-base font-bold leading-snug text-sx-text">
                  {step.title}
                </h3>
                <p className="mt-2.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                  {step.desc}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-1.5 border-t border-sx-border pt-4">
                {step.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-sx-surface-2 px-2 py-0.5 font-sx-mono text-[9px] font-medium text-sx-text-subtle"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Action Link */}
        <div className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-1.5 font-sx-sans text-sm font-semibold text-sx-accent hover:underline"
          >
            Explore the deep architectural walk-through <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
