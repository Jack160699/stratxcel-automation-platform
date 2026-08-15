"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trackFunnel } from "@/lib/analytics/events";
import {
  GlobeIcon,
  SearchIcon,
  DocumentTextIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  TargetIcon,
  HandshakeIcon,
  ChartBarIcon,
  CheckIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

interface GoalOption {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  conversationalSummary: string;
  workflowSteps: { step: string; action: string; badge: string }[];
  deliverable: string;
  ctaText: string;
  ctaHref: string;
}

const GOALS: GoalOption[] = [
  {
    id: "get-more-customers",
    label: "Get more customers",
    category: "Customer Acquisition",
    icon: <UsersGroupIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Turn online discovery into paying clients by connecting search, clear landing pages, and instant WhatsApp inquiry follow-up.",
    workflowSteps: [
      { step: "1. Capture Intent", action: "Identifies searchers and visitors looking for your core services.", badge: "Organic Discovery" },
      { step: "2. Clean Intake", action: "Routes incoming WhatsApp & web questions into one structured pipeline.", badge: "Zero Lost Leads" },
      { step: "3. Drafted Replies", action: "Prepares personalized response drafts ready for your 1-click review.", badge: "Human In Control" },
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
    conversationalSummary:
      "Transform your website into a fast, mobile-friendly storefront with crystal-clear service descriptions and customer proof.",
    workflowSteps: [
      { step: "1. Health Audit", action: "Audits page speed, broken links, and mobile layout readability.", badge: "Core Web Vitals" },
      { step: "2. Copy Polish", action: "Rewrites confusing headlines with clear, benefit-driven customer copy.", badge: "Brand Voice Grounded" },
      { step: "3. Preview Sandbox", action: "Stages all updates in a live preview sandbox for your review before publishing.", badge: "Approval Gate" },
    ],
    deliverable: "A modern, high-converting website that loads quickly on every device.",
    ctaText: "Learn About Website Management",
    ctaHref: "/ai-website-agent",
  },
  {
    id: "get-found-on-google",
    label: "Get found on Google",
    category: "Search Discovery",
    icon: <SearchIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Help prospective buyers find your business when they search for the exact services you provide.",
    workflowSteps: [
      { step: "1. Competitor Gap", action: "Finds the top search keywords local competitors rank for that you're missing.", badge: "SERP Intelligence" },
      { step: "2. Structured Content", action: "Drafts comprehensive, helpful articles answering real customer queries.", badge: "Zero False Claims" },
      { step: "3. Indexation Guard", action: "Submits clean sitemaps to Google Search Console and monitors rankings.", badge: "Compound Discovery" },
    ],
    deliverable: "Higher visibility and steady organic discovery on Google search.",
    ctaText: "Learn About Google SEO Help",
    ctaHref: "/ai-seo-agent",
  },
  {
    id: "grow-on-social-media",
    label: "Grow on social media",
    category: "Social Presence",
    icon: <ShareNodesIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Build trust and brand awareness with consistent, professional weekly posts across LinkedIn, Instagram, and Facebook.",
    workflowSteps: [
      { step: "1. Weekly Calendar", action: "Generates a complete multi-channel content calendar every Monday morning.", badge: "Consistency Score" },
      { step: "2. Native Captions", action: "Writes platform-tailored captions and prepares clean visual cards.", badge: "Multi-Channel" },
      { step: "3. Sign-off Queue", action: "You review and approve with one tap; posts publish on schedule.", badge: "Zero Gimmicks" },
    ],
    deliverable: "Consistent weekly presence without spending hours writing posts.",
    ctaText: "Learn About Social Autopilot",
    ctaHref: "/ai-social-media-agent",
  },
  {
    id: "create-better-content",
    label: "Create better content",
    category: "Content & Copy",
    icon: <DocumentTextIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Draft helpful articles, service guides, customer emails, and FAQs that reflect your genuine expertise.",
    workflowSteps: [
      { step: "1. Brand Grounding", action: "Aligns every draft with your Brand Brain guidelines and factual service rules.", badge: "Verified Grounding" },
      { step: "2. High-Utility Copy", action: "Produces well-structured drafts focused on solving customer problems.", badge: "Original Writing" },
      { step: "3. Human Edit & Sign", action: "Stages drafts in your editor where you can tweak or approve in seconds.", badge: "Full Control" },
    ],
    deliverable: "Compelling, accurate business copy without expensive copywriter fees.",
    ctaText: "Learn About Content Drafting",
    ctaHref: "/ai-content-agent",
  },
  {
    id: "follow-up-with-customers",
    label: "Follow up with customers",
    category: "Lead Follow-up",
    icon: <UsersGroupIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Keep track of every lead and customer inquiry from WhatsApp and web forms so no deal falls through the cracks.",
    workflowSteps: [
      { step: "1. Unified Inbox", action: "Consolidates incoming WhatsApp, form, and email inquiries in one place.", badge: "Centralized CRM" },
      { step: "2. Contact Normalization", action: "Cleans phone numbers, removes duplicates, and records interaction history.", badge: "Clean Records" },
      { step: "3. Smart Follow-ups", action: "Alerts you to pending questions and prepares contextual draft replies.", badge: "Sub-2 Min Speed" },
    ],
    deliverable: "Faster reply times and higher conversion from initial inquiries.",
    ctaText: "Learn About Inquiries & CRM",
    ctaHref: "/ai-crm-agent",
  },
  {
    id: "improve-sales",
    label: "Improve sales",
    category: "Closing Customers",
    icon: <HandshakeIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Turn interested prospects into paying clients with structured quotes, clear proposals, and timely reminders.",
    workflowSteps: [
      { step: "1. Proposal Prep", action: "Structures customized proposals with clear deliverables and pricing breakdown.", badge: "Professional Clarity" },
      { step: "2. Milestone Reminders", action: "Sends automated reminders to your team before client follow-ups turn cold.", badge: "Pipeline Cadence" },
      { step: "3. Won/Lost Analysis", action: "Identifies why deals convert and suggests ways to improve win rates.", badge: "Revenue Intelligence" },
    ],
    deliverable: "Organized proposal workflows that help you close clients with confidence.",
    ctaText: "Learn About Sales Assistance",
    ctaHref: "/ai-business-automation",
  },
  {
    id: "understand-my-business",
    label: "Understand my business",
    category: "Insights & Direction",
    icon: <ChartBarIcon className="w-5 h-5 text-blue-600" />,
    conversationalSummary:
      "Get a clear, jargon-free executive overview of your digital performance and know exactly what to do next.",
    workflowSteps: [
      { step: "1. Data Synthesis", action: "Connects traffic, search visibility, social reach, and lead conversions.", badge: "Unified Attribution" },
      { step: "2. Plain Briefing", action: "Delivers a 1-page weekly summary written in clear, simple business language.", badge: "Weekly Executive Digest" },
      { step: "3. Prioritized Actions", action: "Highlights the top 3 highest-ROI moves for your business this month.", badge: "30/60/90 Roadmap" },
    ],
    deliverable: "Complete clarity on what is driving growth and where to focus next.",
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
            INTERACTIVE DISCOVERY
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            What would you like help with?
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Select your current business priority to see how Stratxcel handles the workflow for you.
          </p>
        </div>

        {/* 2-Column Explorer Workspace */}
        <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
          {/* Left: 8 Goal Options */}
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
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 shadow-xs"
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

          {/* Right: Dynamic Product Demonstration Panel */}
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Governed Execution</span>
                </span>
              </div>

              <h3 className="mt-5 font-sx-sans text-xl font-bold text-slate-900 sm:text-2xl leading-snug">
                {activeGoal.label}
              </h3>

              <p className="mt-3 font-sx-sans text-sm leading-relaxed text-slate-700">
                {activeGoal.conversationalSummary}
              </p>

              {/* Dynamic 3-Step Demonstration */}
              <div className="mt-6 space-y-3 border-t border-slate-200/60 pt-5">
                <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  How Stratxcel executes this workflow:
                </p>
                {activeGoal.workflowSteps.map((ws) => (
                  <div
                    key={ws.step}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sx-sans text-xs font-bold text-slate-900">
                        {ws.step}
                      </span>
                      <span className="font-sx-mono text-[9px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {ws.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 font-sx-sans text-xs text-slate-600 leading-relaxed">
                      {ws.action}
                    </p>
                  </div>
                ))}
              </div>

              {/* What you receive banner */}
              <div className="mt-6 rounded-xl bg-blue-50/60 border border-blue-100 p-4">
                <span className="block font-sx-mono text-[9.5px] font-bold uppercase tracking-wider text-blue-700">
                  What you receive
                </span>
                <p className="mt-1 font-sx-sans text-xs font-semibold text-slate-900">
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
