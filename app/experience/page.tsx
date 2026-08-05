"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

type OperatingLevel = "starter" | "growth" | "advanced";

interface TourStep {
  title: string;
  subtitle: string;
  badge: string;
  demoTitle: string;
  demoContent: React.ReactNode;
  explanation: string;
}

const STARTER_STEPS: TourStep[] = [
  {
    title: "1. Brand Brain Onboarding",
    subtitle: "Define your business identity, target audience, tone of voice, and key offers once.",
    badge: "Foundation",
    demoTitle: "Brand Brain Configuration",
    explanation: "Stratxcel indexes your core positioning, target customer profile, and offer details so every piece of generated content stays aligned with your brand guidelines.",
    demoContent: (
      <div className="space-y-3 text-xs">
        <div className="flex justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-400">Brand Name:</span>
          <span className="font-bold text-white">Apex Fitness Studio</span>
        </div>
        <div className="flex justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-400">Tone of Voice:</span>
          <span className="font-semibold text-cyan-400">Energetic, Professional, Encouraging</span>
        </div>
        <div className="flex justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-400">Target Audience:</span>
          <span className="text-slate-300">Working professionals (25-45) in South Mumbai</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Primary Offer:</span>
          <span className="text-slate-300">₹3,999/mo Personal Guidance Membership</span>
        </div>
      </div>
    ),
  },
  {
    title: "2. Automated Content Plan",
    subtitle: "AI prepares a multi-week Instagram and LinkedIn social publishing schedule.",
    badge: "Copilot",
    demoTitle: "Weekly Content Mission #412",
    explanation: "Copilot drafts high-converting posts, reel scripts, and carousel captions tailored to your audience without manual content creation hassle.",
    demoContent: (
      <div className="space-y-2 text-xs">
        <div className="rounded-sx-sm border border-slate-800 bg-[#111827] p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-cyan-400">Monday · Reel Script</span>
          <p className="mt-1 font-semibold text-white">3 Posture Mistakes Desk Workers Make in Mumbai</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Hook: &quot;If you sit 8 hours a day, watch this...&quot; Call to action: Comment FIT for a free pass.</p>
        </div>
        <div className="rounded-sx-sm border border-slate-800 bg-[#111827] p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-cyan-400">Wednesday · Carousel</span>
          <p className="mt-1 font-semibold text-white">5 High-Protein Indian Snacks Under 200 Calories</p>
        </div>
      </div>
    ),
  },
  {
    title: "3. Human Approval Gate",
    subtitle: "Review, edit, or approve content before anything goes live.",
    badge: "Approval Required",
    demoTitle: "Mission Decision Panel",
    explanation: "AI never publishes risky or unapproved content. You retain complete control over every caption, image, and ad budget.",
    demoContent: (
      <div className="rounded-sx-md border border-amber-500/40 bg-amber-950/30 p-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-sx-mono text-[10px] font-bold text-amber-300">Approval Pending</span>
          <span className="text-[10px] font-sx-mono text-slate-400">Requires Owner Sign-off</span>
        </div>
        <p className="mt-2 text-white font-semibold">Publish Instagram Reel #412 & Story Banner</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded bg-emerald-600 px-3 py-1.5 font-bold text-white text-[11px]">Approve & Schedule</button>
          <button type="button" className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 text-[11px]">Request Re-draft</button>
        </div>
      </div>
    ),
  },
  {
    title: "4. Basic Lead Capture & Report",
    subtitle: "Track incoming responses and view weekly growth analytics.",
    badge: "Reporting",
    demoTitle: "Starter Growth Summary",
    explanation: "See how many leads interacted with your content and review basic weekly performance metrics in one clean view.",
    demoContent: (
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded border border-slate-800 bg-[#111827] p-3 text-center">
          <span className="text-[10px] font-sx-mono text-slate-400 uppercase">New Inquiries</span>
          <p className="text-xl font-extrabold text-cyan-400 mt-1">28</p>
        </div>
        <div className="rounded border border-slate-800 bg-[#111827] p-3 text-center">
          <span className="text-[10px] font-sx-mono text-slate-400 uppercase">Content Published</span>
          <p className="text-xl font-extrabold text-emerald-400 mt-1">12 Posts</p>
        </div>
      </div>
    ),
  },
];

const GROWTH_STEPS: TourStep[] = [
  {
    title: "1. Unified Growth Command Center",
    subtitle: "Manage content, leads, WhatsApp conversations, and campaigns in one workspace.",
    badge: "Growth OS",
    demoTitle: "Active Operations Overview",
    explanation: "Consolidate your entire growth engine so your team and AI copilot work in sync across marketing, sales, and web presence.",
    demoContent: (
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-slate-800 bg-[#111827] p-2.5 text-center">
          <span className="text-[10px] text-slate-400">Active Missions</span>
          <p className="font-bold text-cyan-400 text-base mt-0.5">4 Running</p>
        </div>
        <div className="rounded border border-slate-800 bg-[#111827] p-2.5 text-center">
          <span className="text-[10px] text-slate-400">WhatsApp Inbox</span>
          <p className="font-bold text-emerald-400 text-base mt-0.5">14 Unread</p>
        </div>
        <div className="rounded border border-slate-800 bg-[#111827] p-2.5 text-center">
          <span className="text-[10px] text-slate-400">CRM Pipeline</span>
          <p className="font-bold text-purple-400 text-base mt-0.5">₹1.4L Value</p>
        </div>
      </div>
    ),
  },
  {
    title: "2. WhatsApp Automated Follow-Up",
    subtitle: "Instant lead response within seconds of inquiry.",
    badge: "WhatsApp Business",
    demoTitle: "Automated Lead Sequence",
    explanation: "Never lose a lead due to delayed response. Stratxcel sends personalized WhatsApp welcomes, answers FAQs, and qualifies potential buyers automatically.",
    demoContent: (
      <div className="space-y-2 text-xs">
        <div className="rounded border border-emerald-500/40 bg-emerald-950/30 p-3">
          <span className="font-sx-mono text-[10px] text-emerald-400 font-bold">WhatsApp Lead Notification</span>
          <p className="mt-1 font-semibold text-white">Rajesh M. inquired about Personal Training</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Auto-response sent at 14:02 · Instant 45-second response time</p>
        </div>
      </div>
    ),
  },
  {
    title: "3. CRM Pipeline & Website Sync",
    subtitle: "Web inquiries sync directly into your lead stages and website workspace.",
    badge: "Sync Enabled",
    demoTitle: "Lead Stage Progression",
    explanation: "Track prospect stages from New Lead → Scheduled → Won with full history audit log.",
    demoContent: (
      <div className="flex gap-2 text-xs overflow-x-auto pb-1">
        <div className="min-w-[120px] rounded border border-slate-800 bg-[#111827] p-2.5">
          <span className="text-[10px] font-bold text-cyan-400">New (6)</span>
          <p className="mt-1 text-[11px] text-white">Priya Sharma</p>
        </div>
        <div className="min-w-[120px] rounded border border-slate-800 bg-[#111827] p-2.5">
          <span className="text-[10px] font-bold text-amber-400">Scheduled (4)</span>
          <p className="mt-1 text-[11px] text-white">Rahul Verma</p>
        </div>
        <div className="min-w-[120px] rounded border border-slate-800 bg-[#111827] p-2.5">
          <span className="text-[10px] font-bold text-emerald-400">Won (12)</span>
          <p className="mt-1 text-[11px] text-white">Amit Mehta</p>
        </div>
      </div>
    ),
  },
];

const ADVANCED_STEPS: TourStep[] = [
  {
    title: "1. Multi-Channel Autonomous Missions",
    subtitle: "Coordinate cross-channel campaigns spanning Social, Ads, WhatsApp & Web.",
    badge: "Enterprise OS",
    demoTitle: "Missions Engine",
    explanation: "Advanced level supports custom agent workflows, multi-channel campaign orchestration, team role permissions, and specialized integrations.",
    demoContent: (
      <div className="rounded border border-purple-500/40 bg-purple-950/30 p-3 text-xs">
        <div className="flex justify-between items-center">
          <span className="font-bold text-purple-300">Quarterly Festival Campaign Mission</span>
          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">Active</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-300">Meta Ads + Landing Page + WhatsApp Drip + CRM Tagging</p>
      </div>
    ),
  },
  {
    title: "2. Human Assistance & Dedicated Handoffs",
    subtitle: "Complex technical changes handled by dedicated Stratxcel specialists.",
    badge: "Human-in-the-Loop",
    demoTitle: "Human Specialist Support Queue",
    explanation: "When custom integrations, domain configuration, or bespoke website enhancements are required, expert human specialists take over seamlessly.",
    demoContent: (
      <div className="rounded border border-slate-800 bg-[#111827] p-3 text-xs">
        <div className="flex justify-between">
          <span className="font-bold text-white">Custom Webflow & Domain Binding</span>
          <span className="text-[10px] font-sx-mono text-emerald-400">Specialist Assigned</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Stratxcel Senior Engineer verifying SSL & DNS routing for custom domain.</p>
      </div>
    ),
  },
];

export default function InteractiveExperiencePage() {
  const [level, setLevel] = useState<OperatingLevel>("growth");
  const [stepIndex, setStepIndex] = useState(0);

  const steps = level === "starter" ? STARTER_STEPS : level === "growth" ? GROWTH_STEPS : ADVANCED_STEPS;
  const current = steps[Math.min(stepIndex, steps.length - 1)];

  const handleLevelChange = (newLevel: OperatingLevel) => {
    setLevel(newLevel);
    setStepIndex(0);
  };

  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-slate-900">
      <PublicHeader />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1 font-sx-mono text-xs font-bold uppercase tracking-widest text-sx-accent">
              Interactive Product Tour
            </span>
            <h1 className="mt-4 font-sx-sans text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900">
              Experience the Stratxcel Growth Operating System
            </h1>
            <p className="mt-2 font-sx-sans text-base text-slate-600">
              Select an operating level to see how AI Copilot, Human Approval Gates, WhatsApp Automation, and CRM Workflows operate together.
            </p>
          </div>

          {/* Operating Level Selector */}
          <div className="mt-8 flex justify-center gap-3 border-b border-slate-200 pb-4">
            {(["starter", "growth", "advanced"] as OperatingLevel[]).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => handleLevelChange(l)}
                className={`rounded-sx-md px-6 py-2.5 font-sx-sans text-xs font-bold uppercase tracking-wider transition-all ${
                  level === l
                    ? "bg-sx-accent text-white shadow-md scale-105"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {l} Level
              </button>
            ))}
          </div>

          {/* Tour Interactive Card */}
          <div className="mt-8 rounded-sx-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="font-sx-mono text-xs font-bold text-sx-accent uppercase tracking-wider">
                  Step {stepIndex + 1} of {steps.length} · {level.toUpperCase()} LEVEL
                </span>
                <h2 className="mt-1 font-sx-sans text-xl sm:text-2xl font-bold text-slate-900">
                  {current.title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{current.subtitle}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 font-sx-mono text-xs font-bold text-sx-accent">
                {current.badge}
              </span>
            </div>

            {/* Interactive Preview Canvas */}
            <div className="mt-6 grid gap-6 md:grid-cols-2 items-center">
              <div className="rounded-sx-md border border-slate-800 bg-[#090D18] p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
                  <span className="font-sx-mono text-[11px] font-bold text-slate-400 uppercase">
                    🖥️ {current.demoTitle}
                  </span>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                {current.demoContent}
                <p className="mt-4 text-[10px] font-sx-mono text-slate-500 text-right">
                  [ Sample Interface Data — Product Preview ]
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="font-sx-sans text-sm font-bold text-slate-900 uppercase tracking-wide">
                  How This Works in Stratxcel
                </h3>
                <p className="font-sx-sans text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {current.explanation}
                </p>
                <div className="rounded-sx-sm border border-blue-200 bg-blue-50/60 p-3 text-xs font-semibold text-sx-accent">
                  ✓ Human Control Guaranteed: You approve key actions before execution.
                </div>
              </div>
            </div>

            {/* Step Controls */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                className="rounded-sx-sm border border-slate-300 px-4 py-2 font-sx-sans text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Previous Step
              </button>

              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setStepIndex(i)}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${
                      i === stepIndex ? "bg-sx-accent w-6" : "bg-slate-300"
                    }`}
                  />
                ))}
              </div>

              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                  className="rounded-sx-sm bg-sx-accent px-5 py-2 font-sx-sans text-xs font-bold text-white hover:bg-blue-700"
                >
                  Next Step →
                </button>
              ) : (
                <Link
                  href="/audit"
                  className="rounded-sx-sm bg-emerald-600 px-5 py-2 font-sx-sans text-xs font-bold text-white hover:bg-emerald-500 shadow-md"
                >
                  Start Business Audit →
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
