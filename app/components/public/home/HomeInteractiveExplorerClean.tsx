"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";
import {
  GlobeIcon,
  SearchIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  TargetIcon,
  ChartBarIcon,
  CheckIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

interface GoalOption {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  conversationalSummary: string;
  howStratxcelHelps: string[];
  deliverable: string;
  ctaText: string;
  ctaHref: string;
}

const GOALS: GoalOption[] = [
  {
    id: "get-customers",
    label: "Get more customers",
    category: "Customer Acquisition",
    icon: <UsersGroupIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Turn online discovery into paying clients by connecting search, clear landing pages, and instant WhatsApp inquiry follow-up.",
    howStratxcelHelps: [
      "Attract high-intent searchers looking for your exact services",
      "Route new inquiries directly into a structured lead pipeline",
      "Draft personalized, prompt follow-up replies ready for your 1-click review",
    ],
    deliverable: "An end-to-end client acquisition path with zero forgotten inquiries.",
    ctaText: "Explore Customer Growth Workflows",
    ctaHref: "/solutions",
  },
  {
    id: "improve-website",
    label: "Improve my website",
    category: "Website & UX",
    icon: <GlobeIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Transform your website into a fast, mobile-friendly storefront with crystal-clear service descriptions and customer proof.",
    howStratxcelHelps: [
      "Audit page speed, broken links, and mobile layout readability",
      "Rewrite confusing headlines with clear, benefit-driven customer copy",
      "Stage updates in a live preview sandbox for your approval before publishing",
    ],
    deliverable: "A modern, high-converting website that loads quickly on every device.",
    ctaText: "Learn About Website Management",
    ctaHref: "/ai-website-agent",
  },
  {
    id: "get-found-google",
    label: "Get found on Google",
    category: "Search Discovery",
    icon: <SearchIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Help prospective buyers in your area find your business when they search for the services you provide.",
    howStratxcelHelps: [
      "Identify the top 10 search phrases your local competitors are ranking for",
      "Plan and draft helpful, keyword-grounded articles answering customer questions",
      "Optimize on-page titles, meta tags, and internal link structure",
    ],
    deliverable: "Higher visibility and steady organic discovery on Google search.",
    ctaText: "Learn About Google SEO Help",
    ctaHref: "/ai-seo-agent",
  },
  {
    id: "grow-social",
    label: "Grow on social media",
    category: "Social Presence",
    icon: <ShareNodesIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Build trust and brand awareness with consistent, professional weekly posts across LinkedIn, Instagram, and Facebook.",
    howStratxcelHelps: [
      "Create a planned 7-day multi-channel calendar every Monday",
      "Write platform-native captions tailored to each network's style",
      "Stage clean images and carousel outlines for your quick review",
    ],
    deliverable: "Consistent weekly presence without spending hours writing posts.",
    ctaText: "Learn About Social Autopilot",
    ctaHref: "/ai-social-media-agent",
  },
  {
    id: "stay-in-touch",
    label: "Stay in touch with customers",
    category: "Lead Follow-up",
    icon: <UsersGroupIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Keep track of every lead and customer inquiry from WhatsApp and web forms so no deal falls through the cracks.",
    howStratxcelHelps: [
      "Consolidate incoming questions into one unified, organized inbox",
      "Normalize phone numbers and record client interaction history",
      "Prepare smart follow-up reminders and draft responses for busy days",
    ],
    deliverable: "Faster reply times and higher conversion from initial inquiries.",
    ctaText: "Learn About Inquiries & CRM",
    ctaHref: "/ai-crm-agent",
  },
  {
    id: "improve-marketing",
    label: "Improve my marketing",
    category: "Marketing Strategy",
    icon: <TargetIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Discover which marketing channels actually produce results and stop wasting budget on underperforming campaigns.",
    howStratxcelHelps: [
      "Plan focused promotional campaigns for your key business seasons",
      "Draft varied ad copy and messaging angles to test customer interest",
      "Analyze channel performance so you invest only where it pays off",
    ],
    deliverable: "Clear marketing direction focused on your highest-return opportunities.",
    ctaText: "Learn About Marketing Assistance",
    ctaHref: "/ai-marketing-agent",
  },
  {
    id: "understand-business",
    label: "Understand my business",
    category: "Insights & Direction",
    icon: <ChartBarIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary: "Get a clear, jargon-free executive overview of your digital performance and know exactly what to do next.",
    howStratxcelHelps: [
      "Synthesize traffic, leads, social engagement, and sales trends",
      "Deliver a 1-page weekly summary written in plain business English",
      "Provide a prioritized 30/60/90-day growth roadmap for your business",
    ],
    deliverable: "Complete clarity on what is driving growth and where to focus.",
    ctaText: "Start With Growth Audit — ₹999",
    ctaHref: "/audit",
  },
];

export function HomeInteractiveExplorerClean() {
  const [activeId, setActiveId] = useState<string>(GOALS[0].id);
  const activeGoal = GOALS.find((g) => g.id === activeId) || GOALS[0];

  const handleSelect = (id: string) => {
    setActiveId(id);
    trackFunnel("use_case_selection", { surface: "home_interactive_explorer", choice: id });
  };

  return (
    <section id="explorer" className="border-t border-slate-200/80 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            BUSINESS GOAL EXPLORER
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            What would you like help with?
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Choose your current priority to see how Stratxcel handles it for your business.
          </p>
        </div>

        {/* 2-Column Explorer Workspace */}
        <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
          {/* Left: Goals List */}
          <div role="tablist" aria-label="Business Goals" className="flex flex-col gap-2">
            {GOALS.map((goal) => {
              const isSelected = goal.id === activeId;
              return (
                <button
                  key={goal.id}
                  type="button"
                  role="tab"
                  id={`goal-tab-${goal.id}`}
                  aria-selected={isSelected}
                  aria-controls={`goal-panel-${goal.id}`}
                  onClick={() => handleSelect(goal.id)}
                  className={`flex items-center justify-between rounded-xl border p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/50 shadow-xs"
                      : "border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200/80 shadow-xs">
                      {goal.icon}
                    </div>
                    <div>
                      <span className={`block font-sx-sans text-sm font-bold ${isSelected ? "text-blue-900" : "text-slate-800"}`}>
                        {goal.label}
                      </span>
                      <span className="block text-[11px] text-slate-500 font-medium">
                        {goal.category}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${isSelected ? "text-blue-600" : "text-slate-400"}`}>
                    →
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Conversational Explanation Card */}
          <div
            id={`goal-panel-${activeGoal.id}`}
            role="tabpanel"
            aria-labelledby={`goal-tab-${activeGoal.id}`}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:p-8 shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
                <span className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-blue-600">
                  {activeGoal.category}
                </span>
                <span className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                  Governed Execution
                </span>
              </div>

              <h3 className="mt-5 font-sx-sans text-xl font-bold text-slate-900 sm:text-2xl leading-snug">
                {activeGoal.label}
              </h3>

              <p className="mt-3 font-sx-sans text-sm leading-relaxed text-slate-700">
                {activeGoal.conversationalSummary}
              </p>

              {/* How Stratxcel helps checklist */}
              <div className="mt-6 space-y-2.5 border-t border-slate-200/60 pt-5">
                <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  How Stratxcel handles this for you:
                </p>
                {activeGoal.howStratxcelHelps.map((point) => (
                  <div key={point} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                      <CheckIcon className="w-3 h-3 text-emerald-700" />
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>

              {/* Final deliverable note */}
              <div className="mt-6 rounded-xl bg-white border border-slate-200 p-4">
                <span className="block font-sx-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                  What you receive
                </span>
                <p className="mt-1 font-sx-sans text-xs font-semibold text-slate-800">
                  {activeGoal.deliverable}
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-6">
              <Link
                href={activeGoal.ctaHref}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 font-sx-sans text-xs sm:text-sm font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
              >
                <span>{activeGoal.ctaText}</span>
                <ArrowRightIcon className="ml-1.5 w-3.5 h-3.5" />
              </Link>
              <Link
                href="/audit"
                className="font-sx-sans text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-4"
              >
                Or start with ₹999 Business Audit
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
