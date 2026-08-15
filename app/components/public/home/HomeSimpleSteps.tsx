"use client";

import React from "react";
import Link from "next/link";
import {
  DocumentTextIcon,
  LayersIcon,
  SparklesIcon,
  ChartBarIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

const STEPS = [
  {
    number: "01",
    title: "Tell us about your business.",
    subtitle: "Quick 5-minute intake",
    icon: <DocumentTextIcon className="w-5 h-5 text-blue-600" />,
    desc: "Share your website, core services, target audience, and business goals in a simple guided intake.",
  },
  {
    number: "02",
    title: "Connect what you already use.",
    subtitle: "Simple secure permissions",
    icon: <LayersIcon className="w-5 h-5 text-blue-600" />,
    desc: "Connect your website, Google Search Console, WhatsApp, or social accounts with zero credential exposure.",
  },
  {
    number: "03",
    title: "Stratxcel helps with the work.",
    subtitle: "Staged for your approval",
    icon: <SparklesIcon className="w-5 h-5 text-blue-600" />,
    desc: "Your assistant plans, writes, and stages daily tasks in your dashboard, waiting for your 1-click confirmation.",
  },
  {
    number: "04",
    title: "See what is improving.",
    subtitle: "Clear weekly reporting",
    icon: <ChartBarIcon className="w-5 h-5 text-blue-600" />,
    desc: "Read straightforward weekly progress summaries showing new inquiries, organic traffic, and next growth steps.",
  },
];

export function HomeSimpleSteps() {
  return (
    <section id="how-it-works" className="border-t border-slate-200/80 bg-slate-50/50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            HOW IT WORKS
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            Four simple steps. One connected flow.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            No complicated setup or technical skills required. Built for busy business owners who want results.
          </p>
        </div>

        {/* 4 Connected Steps Grid with Flow Line */}
        <div className="relative mt-16">
          {/* Subtle Horizontal connector line for large screens */}
          <div
            className="pointer-events-none absolute top-1/2 left-8 right-8 hidden -translate-y-8 lg:block border-t-2 border-dashed border-blue-200"
            aria-hidden="true"
          />

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-7 shadow-xs transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shadow-xs">
                      {step.icon}
                    </div>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100/80 font-mono text-xs font-bold text-blue-800">
                      {step.number}
                    </span>
                  </div>

                  <span className="mt-5 block font-sx-mono text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    {step.subtitle}
                  </span>

                  <h3 className="mt-1 font-sx-sans text-base font-bold text-slate-900 leading-snug">
                    {step.title}
                  </h3>

                  <p className="mt-2.5 font-sx-sans text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Link */}
        <div className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-1.5 font-sx-sans text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            <span>Read full walkthrough</span>
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
