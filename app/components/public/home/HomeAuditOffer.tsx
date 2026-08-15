"use client";

import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { AUDIT_INCLUDES } from "@/lib/commercial/audit-positioning";

const AUDIT_STEPS = [
  {
    step: "1. Intake",
    text: "Share your business domain, key goals, and current digital channels in a guided 5-minute setup.",
  },
  {
    step: "2. Analysis",
    text: "The AI Agent audits your discoverability, competitors, messaging clarity, and conversion paths.",
  },
  {
    step: "3. Roadmap",
    text: "Receive a prioritized 30/60/90-day action plan highlighting where growth is leaking and what to fix first.",
  },
  {
    step: "4. Activation",
    text: "Choose to execute independently or activate Stratxcel specialist AI agents to run the work for you.",
  },
];

export function HomeAuditOffer() {
  return (
    <section
      id="start-with-clarity"
      data-home-section="audit"
      className="scroll-mt-20 border-t border-sx-border bg-sx-surface-1 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
          {/* Left Column: Positioning & Step Flow */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sx-accent/20 bg-sx-accent/10 px-3.5 py-1 text-sx-accent">
              <span className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.2em]">
                LOGICAL FIRST STEP
              </span>
            </div>

            <h2 className="mt-4 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold leading-tight tracking-tight text-sx-text">
              Business Growth Audit
            </h2>
            <p className="mt-4 font-sx-sans text-[16px] font-medium leading-relaxed text-sx-text sm:text-[18px]">
              Find the opportunities, gaps and next moves across your digital business.
            </p>
            <p className="mt-3 font-sx-sans text-[14.5px] leading-relaxed text-sx-text-muted">
              Before activating ongoing monthly workflows, start with complete clarity. The Audit is your entry point
              into the larger Stratxcel AI Agent ecosystem.
            </p>

            {/* Steps sequence */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {AUDIT_STEPS.map((s) => (
                <div key={s.step} className="rounded-xl border border-sx-border bg-sx-bg p-4">
                  <p className="font-sx-mono text-[11px] font-bold uppercase text-sx-accent">
                    {s.step}
                  </p>
                  <p className="mt-1.5 font-sx-sans text-xs leading-relaxed text-sx-text-muted">
                    {s.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/how-it-works"
                className="font-sx-sans text-sm font-semibold text-sx-accent hover:underline"
              >
                See detailed audit process breakdown <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Pricing & Conversion Card */}
          <div className="rounded-2xl border border-sx-accent/30 bg-sx-bg p-7 shadow-xl sm:p-9">
            <div className="flex items-center justify-between">
              <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
                Business Growth Audit
              </p>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-sx-mono text-[10px] font-bold uppercase text-emerald-600">
                Guaranteed Clarity
              </span>
            </div>

            <div className="mt-5 flex items-baseline gap-2.5 border-b border-sx-border pb-5">
              <span className="font-sx-sans text-4xl font-bold tracking-tight text-sx-text sm:text-5xl">
                Free
              </span>
              <span className="font-sx-sans text-xs text-sx-text-subtle">
                100% Free · No credit card required
              </span>
            </div>

            <p className="mt-5 font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-sx-text-subtle">
              What your audit delivers
            </p>
            <ul className="mt-3.5 space-y-3">
              {AUDIT_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 font-sx-sans text-[13.5px] leading-snug text-sx-text">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-600">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="home_audit_section"
              plan="audit"
              className="mt-8 flex min-h-12 w-full items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)] motion-reduce:transition-none"
            >
              START FREE BUSINESS AUDIT
            </TrackedCtaLink>

            <p className="mt-3.5 text-center font-sx-sans text-[11.5px] text-sx-text-subtle">
              No subscription starts automatically · Instant evidence-backed delivery
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
