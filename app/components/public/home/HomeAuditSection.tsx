"use client";

import React from "react";
import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { CheckIcon, ArrowRightIcon } from "../icons/FeatureIcons";

const AUDIT_OUTCOMES = [
  "Understand your online presence",
  "Find gaps in your website, SEO, and follow-ups",
  "Identify high-return growth opportunities",
  "Prioritize what matters most for your budget",
  "Get a clear 30/60/90-day actionable roadmap",
];

const PROCESS_STEPS = [
  {
    step: "1. Intake",
    title: "5-Minute Intake",
    desc: "Share your business website, core services, and marketing channels.",
  },
  {
    step: "2. Analysis",
    title: "Diagnosis",
    desc: "We analyze search visibility, competitor moves, and lead response speed.",
  },
  {
    step: "3. Delivery",
    title: "Action Roadmap",
    desc: "Receive your customized 30/60/90-day roadmap in your private dashboard.",
  },
];

export function HomeAuditSection() {
  return (
    <section id="audit" className="border-t border-slate-200/80 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          {/* Left: Positioning & Outcomes */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-blue-50 px-3.5 py-1 text-blue-700">
              <span className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.16em]">
                LOGICAL FIRST STEP
              </span>
            </div>

            <h2 className="mt-4 font-sx-sans text-[clamp(2rem,4vw,3.2rem)] font-bold tracking-tight text-slate-900 leading-tight">
              Not sure what your business needs first?
            </h2>

            <p className="mt-4 font-sx-sans text-base font-semibold text-blue-700 sm:text-lg">
              Find the gaps, opportunities and next steps across your digital business.
            </p>

            <p className="mt-2.5 font-sx-sans text-sm leading-relaxed text-slate-600">
              Before committing to monthly workflows, start with complete clarity. The Audit gives you an objective, evidence-based roadmap tailored to your specific business.
            </p>

            {/* 3 Step sequence */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {PROCESS_STEPS.map((s) => (
                <div key={s.step} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <span className="font-sx-mono text-[10.5px] font-bold uppercase text-blue-600">
                    {s.step}
                  </span>
                  <h4 className="mt-1 font-sx-sans text-xs font-bold text-slate-900">
                    {s.title}
                  </h4>
                  <p className="mt-1 font-sx-sans text-[11.5px] leading-relaxed text-slate-500">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-1.5 font-sx-sans text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                <span>Learn more about the audit process</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Right: Pricing Box Card */}
          <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-b from-white to-slate-50 p-7 shadow-lg shadow-slate-200/50 sm:p-9">
            <div className="flex items-center justify-between">
              <span className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">
                Business Growth Audit
              </span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-700">
                Guaranteed Clarity
              </span>
            </div>

            <div className="mt-5 flex items-baseline gap-2.5 border-b border-slate-200/80 pb-5">
              <span className="font-sx-sans text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Free
              </span>
              <span className="font-sx-sans text-xs text-slate-500 font-medium">
                100% Free · No credit card required
              </span>
            </div>

            <p className="mt-5 font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Simple outcomes you receive:
            </p>

            <ul className="mt-3.5 space-y-2.5">
              {AUDIT_OUTCOMES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 leading-snug">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                    <CheckIcon className="w-3 h-3 text-emerald-700" />
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
              className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 font-sx-sans text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
            >
              <span>START FREE BUSINESS AUDIT</span>
              <ArrowRightIcon className="ml-2 w-4 h-4" />
            </TrackedCtaLink>

            <p className="mt-3 text-center font-sx-sans text-xs text-slate-500">
              No subscription or payment required · Instant analysis delivered straight to your dashboard
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
