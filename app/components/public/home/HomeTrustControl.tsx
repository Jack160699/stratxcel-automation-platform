"use client";

import React from "react";
import Link from "next/link";
import {
  ShieldCheckIcon,
  LockClosedIcon,
  CheckIcon,
  GlobeIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

const TRUST_POINTS = [
  {
    title: "Important work can require approval.",
    icon: <ShieldCheckIcon className="w-5 h-5 text-blue-600" />,
    desc: "Stratxcel never publishes articles, changes website settings, or spends budget without your explicit sign-off in the dashboard.",
  },
  {
    title: "Your accounts remain yours.",
    icon: <LockClosedIcon className="w-5 h-5 text-blue-600" />,
    desc: "You retain full ownership and administrative control over your domain, Google accounts, WhatsApp number, and social profiles.",
  },
  {
    title: "Business information stays separated.",
    icon: <GlobeIcon className="w-5 h-5 text-blue-600" />,
    desc: "Dedicated tenant isolation protects your business numbers, pricing, and client records from ever being pooled or exposed to other businesses.",
  },
  {
    title: "You can see what Stratxcel is doing.",
    icon: <CheckIcon className="w-5 h-5 text-blue-600" />,
    desc: "Transparent logs, staged previews, and straightforward weekly progress summaries keep you fully informed every step of the way.",
  },
];

export function HomeTrustControl() {
  return (
    <section className="border-t border-slate-200/80 bg-slate-50/50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            SECURITY &amp; GOVERNANCE
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            YOU STAY IN CONTROL.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Stratxcel assists your business while keeping you firmly in the driver&apos;s seat.
          </p>
        </div>

        {/* 4 Trust Cards Grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <div
              key={point.title}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-7 shadow-xs transition-all hover:border-blue-300 hover:shadow-md"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shadow-xs">
                  {point.icon}
                </div>
                <h3 className="mt-5 font-sx-sans text-base font-bold text-slate-900 leading-snug">
                  {point.title}
                </h3>
                <p className="mt-2.5 font-sx-sans text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  {point.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Deep link to security architecture */}
        <div className="mt-12 text-center">
          <Link
            href="/security"
            className="inline-flex items-center gap-1.5 font-sx-sans text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            <span>Read detailed security and privacy architecture</span>
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
