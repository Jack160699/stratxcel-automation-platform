"use client";

import React from "react";
import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { ArrowRightIcon, ShieldCheckIcon } from "../icons/FeatureIcons";

export function HomeClosingSection() {
  return (
    <section className="border-t border-slate-200/80 bg-gradient-to-b from-white via-slate-50/50 to-white py-20 sm:py-28 text-center">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          GET STARTED WITH STRATXCEL
        </p>

        <h2 className="mt-4 font-sx-sans text-[clamp(2rem,4.5vw,3.4rem)] font-bold tracking-tight text-slate-900 leading-tight">
          You run the business.<br className="hidden sm:inline" /> Let Stratxcel help with the work behind it.
        </h2>

        <p className="mx-auto mt-5 max-w-2xl font-sx-sans text-base sm:text-lg leading-relaxed text-slate-600">
          Start with an evidence-backed growth audit, or explore how Stratxcel handles the digital work behind your business every day.
        </p>

        {/* Dual CTAs */}
        <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="home_final_primary"
            plan="audit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg sm:w-auto"
          >
            <span>GET YOUR FREE INSTANT AUDIT</span>
            <ArrowRightIcon className="ml-2 w-4 h-4" />
          </TrackedCtaLink>

          <a
            href="#how-it-works"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 font-sx-sans text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400 sm:w-auto"
          >
            SEE HOW IT WORKS
          </a>
        </div>

        {/* Secondary Trust Note */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 font-medium">
          <span>100% Free Audit</span>
          <span>•</span>
          <span>No credit card required</span>
          <span>•</span>
          <Link href="/security" className="text-slate-700 hover:underline">
            Security &amp; Privacy
          </Link>
          <span>•</span>
          <Link href="/contact?intent=demo" className="text-slate-700 hover:underline">
            Talk to our team
          </Link>
        </div>
      </div>
    </section>
  );
}
