"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { OFFICIAL_LOGO } from "@/lib/brand";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import {
  GlobeIcon,
  SearchIcon,
  DocumentTextIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  CheckIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";
import {
  WebsiteUiPreview,
  SeoUiPreview,
  ContentUiPreview,
  SocialUiPreview,
  CrmUiPreview,
  AnalyticsUiPreview,
} from "./ui/ProductUiPreviews";

interface CapabilityTab {
  id: string;
  name: string;
  category: string;
  icon: React.ReactNode;
  summary: string;
  preview: React.ReactNode;
}

const CAPABILITY_TABS: CapabilityTab[] = [
  {
    id: "website",
    name: "Website",
    category: "Site & Mobile",
    icon: <GlobeIcon className="w-4 h-4 text-blue-600" />,
    summary: "Keeps your pages fast, modern, and updated without waiting on web developers.",
    preview: <WebsiteUiPreview />,
  },
  {
    id: "seo",
    name: "Google & Search",
    category: "Discovery",
    icon: <SearchIcon className="w-4 h-4 text-blue-600" />,
    summary: "Helps local and online customers discover your business when searching.",
    preview: <SeoUiPreview />,
  },
  {
    id: "content",
    name: "Content & Copy",
    category: "Brand Voice",
    icon: <DocumentTextIcon className="w-4 h-4 text-blue-600" />,
    summary: "Drafts clear, compelling articles and briefs tailored to your exact brand tone.",
    preview: <ContentUiPreview />,
  },
  {
    id: "social",
    name: "Social Media",
    category: "Consistency",
    icon: <ShareNodesIcon className="w-4 h-4 text-blue-600" />,
    summary: "Prepares weekly calendars and native captions for LinkedIn, Instagram & Facebook.",
    preview: <SocialUiPreview />,
  },
  {
    id: "crm",
    name: "Customer Leads",
    category: "Inquiries & CRM",
    icon: <UsersGroupIcon className="w-4 h-4 text-blue-600" />,
    summary: "Organizes WhatsApp and web inquiries so no potential customer is forgotten.",
    preview: <CrmUiPreview />,
  },
  {
    id: "analytics",
    name: "Reporting",
    category: "Weekly Insights",
    icon: <ChartBarIcon className="w-4 h-4 text-blue-600" />,
    summary: "Clear executive briefings on what is working and what to focus on next.",
    preview: <AnalyticsUiPreview />,
  },
];

export function HomeHeroLight() {
  const [activeTabId, setActiveTabId] = useState<string>("website");
  const activeTab = CAPABILITY_TABS.find((t) => t.id === activeTabId) || CAPABILITY_TABS[0];

  return (
    <section
      id="hero"
      data-home-section="hero"
      className="relative overflow-hidden bg-gradient-to-b from-white via-[#f8fafc] to-[#f1f5f9] pt-28 pb-20 sm:pt-36 sm:pb-28"
    >
      {/* Background Decorative Grid Lines */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e2e8f015_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f015_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Headline & Value Proposition */}
        <div className="mx-auto max-w-4xl text-center">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-600/20 bg-blue-50/80 px-4 py-1.5 text-blue-700 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="font-sx-mono text-xs font-semibold uppercase tracking-[0.16em]">
              STRATXCEL AI AGENT
            </span>
          </div>

          {/* Primary H1 */}
          <h1 className="mt-6 font-sx-sans text-[clamp(2.4rem,5.5vw,4.4rem)] font-bold tracking-[-0.035em] text-slate-900 leading-[1.08]">
            Your AI assistant for the{" "}
            <span className="text-blue-600 underline decoration-blue-200 decoration-4 underline-offset-8">
              business you are building.
            </span>
          </h1>

          {/* Clean, Human Subhead */}
          <p className="mx-auto mt-6 max-w-2xl font-sx-sans text-base sm:text-lg leading-relaxed text-slate-600">
            Connect the tools you already use and let Stratxcel help with your website, marketing, content, customers and growth.
          </p>

          {/* Dual CTAs */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="home_hero_primary"
              plan="audit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-8 py-3.5 font-sx-sans text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg sm:w-auto"
            >
              <span>GET YOUR BUSINESS AUDIT — ₹999</span>
              <ArrowRightIcon className="ml-2 w-4 h-4" />
            </TrackedCtaLink>

            <a
              href="#how-it-works"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 font-sx-sans text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-400 sm:w-auto"
            >
              SEE HOW IT WORKS
            </a>
          </div>

          <p className="mt-3.5 font-sx-sans text-xs text-slate-500">
            One-time ₹999 audit · GST included · No subscription starts automatically
          </p>
        </div>

        {/* Realistic SaaS Product Interface Mockup */}
        <div className="mt-14 mx-auto max-w-5xl select-none">
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50">
            {/* Top Workspace Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/90 px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="relative h-7 w-7">
                  <Image
                    src={OFFICIAL_LOGO.src}
                    alt="Stratxcel AI Agent"
                    width={OFFICIAL_LOGO.width}
                    height={OFFICIAL_LOGO.height}
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <div>
                  <span className="block font-sx-sans text-xs font-bold text-slate-800">
                    Stratxcel AI Assistant
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Active for your business
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  All Tools Connected
                </span>
                <span className="hidden sm:flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600" />
                  Human Approval Gate: Active
                </span>
              </div>
            </div>

            {/* Interactive Capability Selector Tabs */}
            <div className="border-b border-slate-200/80 bg-white px-4 pt-3 sm:px-6">
              <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar" role="tablist">
                {CAPABILITY_TABS.map((tab) => {
                  const isSelected = activeTabId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveTabId(tab.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        isSelected
                          ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-xs"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Stage Panel */}
            <div className="p-5 sm:p-7 bg-slate-50/40">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center">
                <div>
                  <span className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    {activeTab.category}
                  </span>
                  <h2 className="mt-1 font-sx-sans text-xl font-bold text-slate-900 sm:text-2xl">
                    {activeTab.name} Management
                  </h2>
                  <p className="mt-2.5 font-sx-sans text-sm leading-relaxed text-slate-600">
                    {activeTab.summary}
                  </p>

                  <div className="mt-5 space-y-2 border-t border-slate-200/60 pt-4">
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                        ✓
                      </span>
                      <span>Prepared automatically from your Brand Voice</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                        ✓
                      </span>
                      <span>Requires your 1-click sign-off before publishing</span>
                    </div>
                  </div>
                </div>

                {/* Live UI Mockup Preview Component */}
                <div className="bg-white rounded-xl border border-slate-200/80 p-2 shadow-sm">
                  {activeTab.preview}
                </div>
              </div>
            </div>

            {/* Bottom Guarantee Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50 px-5 py-3 text-xs text-slate-600 sm:px-6">
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Your accounts stay yours · Zero unauthorized publishing</span>
              </div>
              <Link
                href="/how-it-works"
                className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Learn how it works <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
