"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StatusChip } from "@/components/ui/StatusChip";

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
        <div className="flex justify-between border-b border-sx-border pb-2">
          <span className="text-sx-text-subtle">Brand Name:</span>
          <span className="font-bold text-sx-text">Apex Fitness Studio</span>
        </div>
        <div className="flex justify-between border-b border-sx-border pb-2">
          <span className="text-sx-text-subtle">Tone of Voice:</span>
          <span className="font-semibold text-sx-accent">Energetic, Professional, Encouraging</span>
        </div>
        <div className="flex justify-between border-b border-sx-border pb-2">
          <span className="text-sx-text-subtle">Target Audience:</span>
          <span className="text-sx-text-muted">Working professionals (25-45) in South Mumbai</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sx-text-subtle">Primary Offer:</span>
          <span className="text-sx-text-muted">₹3,999/mo Personal Guidance Membership</span>
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
        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-accent">Monday · Reel Script</span>
          <p className="mt-1 font-semibold text-sx-text font-sx-sans">3 Posture Mistakes Desk Workers Make in Mumbai</p>
          <p className="mt-0.5 text-[11px] text-sx-text-muted">Hook: &quot;If you sit 8 hours a day, watch this...&quot; Call to action: Comment FIT for a free pass.</p>
        </div>
        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-accent">Wednesday · Carousel</span>
          <p className="mt-1 font-semibold text-sx-text font-sx-sans">5 High-Protein Indian Snacks Under 200 Calories</p>
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
      <div className="rounded-sx-md border border-amber-500/30 bg-amber-950/20 p-4 text-xs">
        <div className="flex items-center justify-between">
          <StatusChip state="warning">Approval Pending</StatusChip>
          <span className="text-[10px] font-sx-mono text-sx-text-subtle">Requires Owner Sign-off</span>
        </div>
        <p className="mt-2 text-sx-text font-semibold">Publish Instagram Reel #412 & Story Banner</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded-sx-sm bg-emerald-600 px-3 py-1.5 font-bold text-white text-[11px]">Approve & Schedule</button>
          <button type="button" className="rounded-sx-sm border border-sx-border px-3 py-1.5 text-sx-text text-[11px]">Request Re-draft</button>
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
        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-center">
          <span className="text-[10px] font-sx-mono text-sx-text-subtle uppercase">New Inquiries</span>
          <p className="text-xl font-extrabold text-sx-accent mt-1">28</p>
        </div>
        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-center">
          <span className="text-[10px] font-sx-mono text-sx-text-subtle uppercase">Content Published</span>
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
        <div className="rounded border border-sx-border bg-sx-surface-2 p-2 text-center">
          <span className="text-[10px] text-sx-text-subtle">Active Missions</span>
          <p className="font-bold text-sx-accent text-base mt-0.5">4 Running</p>
        </div>
        <div className="rounded border border-sx-border bg-sx-surface-2 p-2 text-center">
          <span className="text-[10px] text-sx-text-subtle">WhatsApp Inbox</span>
          <p className="font-bold text-emerald-400 text-base mt-0.5">14 Unread</p>
        </div>
        <div className="rounded border border-sx-border bg-sx-surface-2 p-2 text-center">
          <span className="text-[10px] text-sx-text-subtle">CRM Pipeline</span>
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
        <div className="rounded-sx-sm border border-emerald-500/30 bg-emerald-950/20 p-2.5">
          <span className="font-sx-mono text-[10px] text-emerald-400 font-bold">WhatsApp Lead Notification</span>
          <p className="mt-1 font-semibold text-sx-text">Rajesh M. inquired about Personal Training</p>
          <p className="mt-0.5 text-[10px] text-sx-text-subtle">Auto-response sent at 14:02 · Instant 45-second response time</p>
        </div>
      </div>
    ),
  },
  {
    title: "3. CRM Pipeline & Website Sync",
    subtitle: "Web inquiries sync directly into your lead stages and website workspace.",
    badge: "Sync Enabled",
    demoTitle: "Lead Stage Progression",
    explanation: "Track prospect stages from New Lead -> Contacted -> Consultation Scheduled -> Closed Customer with full history audit log.",
    demoContent: (
      <div className="flex gap-2 text-xs overflow-x-auto pb-1">
        <div className="min-w-[120px] rounded border border-sx-border bg-sx-surface-2 p-2">
          <span className="text-[10px] font-bold text-sx-accent">New (6)</span>
          <p className="mt-1 text-[11px] text-sx-text">Priya Sharma</p>
        </div>
        <div className="min-w-[120px] rounded border border-sx-border bg-sx-surface-2 p-2">
          <span className="text-[10px] font-bold text-amber-400">Scheduled (4)</span>
          <p className="mt-1 text-[11px] text-sx-text">Rahul Verma</p>
        </div>
        <div className="min-w-[120px] rounded border border-sx-border bg-sx-surface-2 p-2">
          <span className="text-[10px] font-bold text-emerald-400">Won (12)</span>
          <p className="mt-1 text-[11px] text-sx-text">Amit Mehta</p>
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
    demoTitle: "Missions & Workflows Engine",
    explanation: "Advanced level supports custom agent workflows, multi-channel campaign orchestration, team role permissions, and specialized integrations.",
    demoContent: (
      <div className="space-y-2 text-xs">
        <div className="rounded-sx-sm border border-purple-500/30 bg-purple-950/20 p-3">
          <div className="flex justify-between items-center">
            <span className="font-bold text-purple-300">Quarterly Festival Campaign Mission</span>
            <StatusChip state="ai">Copilot Active</StatusChip>
          </div>
          <p className="mt-1 text-[11px] text-sx-text-muted">Meta Ads + Landing Page + WhatsApp Drip + CRM Tagging</p>
        </div>
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
      <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs">
        <div className="flex justify-between">
          <span className="font-bold text-sx-text">Custom Webflow & Domain Binding</span>
          <span className="text-[10px] font-sx-mono text-emerald-400">Specialist Assigned</span>
        </div>
        <p className="mt-1 text-[11px] text-sx-text-muted">Stratxcel Senior Engineer verifying SSL & DNS routing for custom domain.</p>
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
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="text-center">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Interactive Product Tour
            </span>
            <h1 className="mt-4 font-sx-sans text-3xl font-extrabold tracking-tight sm:text-4xl text-sx-text">
              Experience the Stratxcel Growth Operating System
            </h1>
            <p className="mt-2 font-sx-sans text-sm text-sx-text-muted sm:text-base max-w-2xl mx-auto">
              Select an operating level to see how AI Copilot, Human Approval Gates, WhatsApp Automation, and CRM Workflows operate together.
            </p>
          </div>

          {/* Operating Level Selector */}
          <div className="mt-8 flex justify-center gap-2 sm:gap-4 border-b border-sx-border pb-4">
            {(["starter", "growth", "advanced"] as OperatingLevel[]).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => handleLevelChange(l)}
                className={`rounded-sx-md px-5 py-2.5 font-sx-sans text-xs font-bold uppercase tracking-wider transition-all ${
                  level === l
                    ? "bg-sx-accent text-sx-accent-on shadow-lg scale-105"
                    : "border border-sx-border bg-sx-surface-1 text-sx-text-muted hover:border-sx-border-strong hover:text-sx-text"
                }`}
              >
                {l} Level
              </button>
            ))}
          </div>

          {/* Interactive Tour Display Card */}
          <div className="mt-8 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8 shadow-2xl">
            {/* Step Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sx-border pb-4">
              <div>
                <span className="font-sx-mono text-xs font-semibold text-sx-accent uppercase tracking-wider">
                  Step {stepIndex + 1} of {steps.length} · {level.toUpperCase()} LEVEL
                </span>
                <h2 className="mt-1 font-sx-sans text-xl sm:text-2xl font-bold text-sx-text">
                  {current.title}
                </h2>
                <p className="text-xs sm:text-sm text-sx-text-muted mt-0.5">{current.subtitle}</p>
              </div>
              <StatusChip state="accent">{current.badge}</StatusChip>
            </div>

            {/* Interactive Preview Panel */}
            <div className="mt-6 grid gap-6 md:grid-cols-2 items-center">
              {/* Demo Surface */}
              <div className="rounded-sx-md border border-sx-border bg-[#0a0d16] p-5 shadow-inner">
                <div className="flex items-center justify-between border-b border-sx-border/60 pb-2 mb-4">
                  <span className="font-sx-mono text-[11px] font-bold text-sx-text-subtle uppercase">
                    🖥️ {current.demoTitle}
                  </span>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                {current.demoContent}
                <p className="mt-4 text-[10px] font-sx-mono text-sx-text-subtle text-right">
                  [ Sample Interface Data — Product Demonstration ]
                </p>
              </div>

              {/* Explanation */}
              <div className="space-y-4">
                <h3 className="font-sx-sans text-sm font-bold text-sx-text uppercase tracking-wide">
                  How This Works in Stratxcel
                </h3>
                <p className="font-sx-sans text-xs sm:text-sm text-sx-text-muted leading-relaxed">
                  {current.explanation}
                </p>
                <div className="rounded-sx-sm border border-sx-accent/20 bg-sx-accent/5 p-3 text-xs text-sx-accent">
                  ✓ Human Control Guaranteed: You approve key actions before execution.
                </div>
              </div>
            </div>

            {/* Tour Controls */}
            <div className="mt-8 flex items-center justify-between border-t border-sx-border pt-4">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                className="rounded-sx-sm border border-sx-border-strong px-4 py-2 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2 disabled:opacity-40"
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
                      i === stepIndex ? "bg-sx-accent w-6" : "bg-sx-border-strong"
                    }`}
                  />
                ))}
              </div>

              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                  className="rounded-sx-sm bg-sx-accent px-5 py-2 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                >
                  Next Step →
                </button>
              ) : (
                <Link
                  href="/audit"
                  className="rounded-sx-sm bg-emerald-600 px-5 py-2 font-sx-sans text-xs font-bold text-white hover:bg-emerald-500 shadow-md"
                >
                  Request ₹999 Growth Audit →
                </Link>
              )}
            </div>
          </div>

          {/* Bottom Conversion Banner */}
          <div className="mt-12 rounded-sx-lg border border-sx-border bg-gradient-to-r from-sx-surface-1 via-sx-surface-2 to-sx-surface-1 p-6 text-center">
            <h3 className="font-sx-sans text-lg font-bold text-sx-text">Ready to Build Your Growth OS?</h3>
            <p className="mt-1 text-xs text-sx-text-muted">Start with our ₹999 Business Growth Audit. 100% adjusted against subscription within 7 days.</p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/audit" className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]">
                Start Growth Audit (₹999)
              </Link>
              <Link href="/pricing" className="rounded-sx-sm border border-sx-border-strong px-6 py-2.5 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2">
                View Pricing Plans
              </Link>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
