"use client";

import React from "react";
import Link from "next/link";
import {
  DocumentTextIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CheckIcon,
} from "../icons/FeatureIcons";

const PILLARS = [
  {
    step: "01",
    title: "Learns your business once",
    icon: <DocumentTextIcon className="w-5 h-5 text-blue-600" />,
    desc: "Tell Stratxcel about your services, pricing, ideal clients, and brand voice. It remembers your rules for every task so all outputs sound like you.",
    highlights: ["Tone and style rules", "Product & pricing grounding", "Zero false promises"],
  },
  {
    step: "02",
    title: "Prepares your daily work",
    icon: <SparklesIcon className="w-5 h-5 text-blue-600" />,
    desc: "Your assistant drafts website copy, keyword-targeted articles, weekly social posts, and follow-up replies ready for your day.",
    highlights: ["Search-optimized articles", "Weekly social calendars", "Inquiry reply drafts"],
  },
  {
    step: "03",
    title: "You stay in complete control",
    icon: <ShieldCheckIcon className="w-5 h-5 text-blue-600" />,
    desc: "Nothing is published or sent automatically without your knowledge. You review, make any quick edits, and approve with a single click.",
    highlights: ["1-click approval gate", "No surprise postings", "Tenant-isolated privacy"],
  },
];

export function HomeHowStratxcelHelps() {
  return (
    <section className="border-t border-slate-200/80 bg-slate-50/50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            THE STRATXCEL APPROACH
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            One place to manage the digital side of your business.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Stratxcel acts as your dedicated digital assistant. It understands your business, prepares your daily work, and waits for your confirmation.
          </p>
        </div>

        {/* 3 Core Pillars */}
        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.step}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-7 shadow-xs transition-all hover:border-blue-200 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
                    {p.icon}
                  </div>
                  <span className="font-sx-mono text-2xl font-bold tracking-tight text-slate-300">
                    {p.step}
                  </span>
                </div>

                <h3 className="mt-5 font-sx-sans text-lg font-bold text-slate-900">
                  {p.title}
                </h3>
                <p className="mt-2.5 font-sx-sans text-sm leading-relaxed text-slate-600">
                  {p.desc}
                </p>

                <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 font-bold">
                        <CheckIcon className="w-3 h-3 text-emerald-600" />
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Visual Process Flow Strip */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500 text-center sm:text-left">
            How Your Daily Workflow Operates
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
              <span className="block font-sx-mono text-[9px] uppercase tracking-wider text-blue-600 font-bold">
                Step 1
              </span>
              <span className="mt-1 block font-sx-sans text-xs font-bold text-slate-800">
                Your Business Voice
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
              <span className="block font-sx-mono text-[9px] uppercase tracking-wider text-blue-600 font-bold">
                Step 2
              </span>
              <span className="mt-1 block font-sx-sans text-xs font-bold text-slate-800">
                AI Prepares Drafts
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
              <span className="block font-sx-mono text-[9px] uppercase tracking-wider text-blue-600 font-bold">
                Step 3
              </span>
              <span className="mt-1 block font-sx-sans text-xs font-bold text-slate-800">
                You Review & Approve
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
              <span className="block font-sx-mono text-[9px] uppercase tracking-wider text-blue-600 font-bold">
                Step 4
              </span>
              <span className="mt-1 block font-sx-sans text-xs font-bold text-slate-800">
                Publish & Distribute
              </span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-center">
              <span className="block font-sx-mono text-[9px] uppercase tracking-wider text-emerald-600 font-bold">
                Outcome
              </span>
              <span className="mt-1 block font-sx-sans text-xs font-bold text-emerald-900">
                Steady Business Growth
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
