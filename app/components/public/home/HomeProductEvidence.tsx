"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  LockClosedIcon,
  ShieldCheckIcon,
  CheckIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

interface ProductScreen {
  id: string;
  title: string;
  badge: "LIVE" | "BETA" | "STAFF-ASSISTED" | "COMING SOON";
  badgeClass: string;
  description: string;
  interfaceType: string;
  previewDetails: {
    heading: string;
    subheading: string;
    items: { label: string; detail: string; status: string }[];
    governanceNote: string;
  };
}

const PRODUCT_SCREENS: ProductScreen[] = [
  {
    id: "audit-screen",
    title: "Growth Audit Dashboard",
    badge: "LIVE",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "The initial diagnostic screen delivered after intake, highlighting gaps and prioritized 30/60/90-day action items.",
    interfaceType: "Diagnostic Report View",
    previewDetails: {
      heading: "Business Growth Diagnostic Roadmap",
      subheading: "Delivered directly into your private workspace",
      items: [
        { label: "Website Speed & Mobile Layout", detail: "Scored across Core Web Vitals & mobile viewport responsiveness", status: "Audit Complete" },
        { label: "Google Competitor Keyword Gap", detail: "Analyzes top 10 search phrases competitors capture in your area", status: "8 Opportunities Found" },
        { label: "Inbound Lead Path Review", detail: "Checks WhatsApp & web form response speed and contact hygiene", status: "Roadmap Formatted" },
      ],
      governanceNote: "One-time report. No automated subscription or unauthorized data modification.",
    },
  },
  {
    id: "task-queue",
    title: "Agent Task Sign-Off Queue",
    badge: "LIVE",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Every drafted article, social post, and landing page copy update waits here for your 1-click review.",
    interfaceType: "Human Approval Sandbox",
    previewDetails: {
      heading: "Staged Actions Awaiting Your Confirmation",
      subheading: "Nothing is published to live channels without human sign-off",
      items: [
        { label: "SEO Article Draft", detail: "'How to Choose the Right Commercial Architecture Partner'", status: "Staged (Review)" },
        { label: "LinkedIn Weekly Carousel", detail: "3-slide visual summary explaining recent service updates", status: "Awaiting 1-Click Approval" },
        { label: "Pricing Page Copy Tweak", detail: "Clearer service breakdown staged on preview subdomain", status: "Pending Confirmation" },
      ],
      governanceNote: "All mutations require explicit tenant owner confirmation.",
    },
  },
  {
    id: "brand-brain",
    title: "Brand Brain & Knowledge Rules",
    badge: "LIVE",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Your business truth repository. Enforces factual service rules, pricing limits, and brand tone across all outputs.",
    interfaceType: "Grounding Engine",
    previewDetails: {
      heading: "Verified Brand & Business Guardrails",
      subheading: "Zero hallucination policy gates applied across all agent generations",
      items: [
        { label: "Service Catalog Grounding", detail: "Strict list of offered services; out-of-scope requests rejected", status: "Enforced" },
        { label: "Zero False Claims Policy", detail: "Prohibits unverified statistics, fake awards, or exaggerated promises", status: "Active Guard" },
        { label: "Tone & Voice Settings", detail: "Calm, professional, helpful tone calibrated to Indian SMB commerce", status: "Calibrated" },
      ],
      governanceNote: "Customer data is never used to train shared public foundation models.",
    },
  },
  {
    id: "weekly-briefing",
    title: "Weekly Executive Digest",
    badge: "BETA",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    description: "A 1-page Monday morning digest synthesizing web visits, inquiries, and next 7-day priorities in plain English.",
    interfaceType: "Executive Intelligence",
    previewDetails: {
      heading: "Monday Morning Executive Briefing",
      subheading: "Actionable summary with zero confusing vanity metrics",
      items: [
        { label: "Search & Visibility Trends", detail: "Which search terms brought new visits this week", status: "Synthesized" },
        { label: "Inquiry Ingestion Summary", detail: "Total inquiries routed through WhatsApp and website forms", status: "Organized" },
        { label: "Top 3 Recommended Moves", detail: "Highest-leverage digital tasks suggested for the coming week", status: "Ready for Sign-off" },
      ],
      governanceNote: "Available in production with active customer feedback iteration.",
    },
  },
];

export function HomeProductEvidence() {
  const [activeTab, setActiveTab] = useState<string>(PRODUCT_SCREENS[0].id);
  const activeScreen = PRODUCT_SCREENS.find((s) => s.id === activeTab) || PRODUCT_SCREENS[0];

  return (
    <section id="proof" className="border-t border-slate-200/80 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            REAL PRODUCT EVIDENCE
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            Built for real business operations.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            We build real software and label every capability with radical honesty. Zero fabricated customer metrics, zero fake reviews, and zero unverified claims.
          </p>
        </div>

        {/* Product Preview Workstation */}
        <div className="mt-14 rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-lg overflow-hidden">
          {/* Top Tab Bar with Truthful Availability Labels */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white p-3 sm:px-6">
            {PRODUCT_SCREENS.map((screen) => {
              const isSelected = screen.id === activeTab;
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => setActiveTab(screen.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-slate-100 text-blue-900 border border-slate-300/80 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                  }`}
                >
                  <span>{screen.title}</span>
                  <span
                    className={`rounded border px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase ${screen.badgeClass}`}
                  >
                    {screen.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Screen Content Body */}
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
                <div>
                  <span className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    {activeScreen.interfaceType}
                  </span>
                  <h3 className="mt-1 font-sx-sans text-lg font-bold text-slate-900 sm:text-xl">
                    {activeScreen.previewDetails.heading}
                  </h3>
                  <p className="mt-1 font-sx-sans text-xs text-slate-500">
                    {activeScreen.previewDetails.subheading}
                  </p>
                </div>
                <span
                  className={`self-start rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase ${activeScreen.badgeClass}`}
                >
                  Status: {activeScreen.badge}
                </span>
              </div>

              {/* Staged Items List */}
              <div className="mt-6 space-y-3">
                {activeScreen.previewDetails.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <span className="block font-sx-sans text-xs font-bold text-slate-900">
                        {item.label}
                      </span>
                      <span className="block font-sx-sans text-xs text-slate-600 mt-0.5">
                        {item.detail}
                      </span>
                    </div>
                    <span className="self-start rounded bg-white border border-slate-200 px-2.5 py-1 font-mono text-[10px] font-semibold text-slate-700 sm:self-auto shrink-0">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bottom Guarantee Note */}
              <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-4">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{activeScreen.previewDetails.governanceNote}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Availability Standard Definitions */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <span className="inline-block rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-700">
              LIVE
            </span>
            <p className="mt-2 font-sx-sans text-xs text-slate-600">
              Built, tested, and running in production for direct business use.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <span className="inline-block rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-700">
              BETA
            </span>
            <p className="mt-2 font-sx-sans text-xs text-slate-600">
              Working in production, actively refined with direct customer feedback.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <span className="inline-block rounded border border-purple-200 bg-purple-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-purple-700">
              STAFF-ASSISTED
            </span>
            <p className="mt-2 font-sx-sans text-xs text-slate-600">
              Our team operates the workflow alongside you while automation matures.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <span className="inline-block rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-slate-600">
              COMING SOON
            </span>
            <p className="mt-2 font-sx-sans text-xs text-slate-600">
              On the product roadmap. Explicitly declared before release.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
