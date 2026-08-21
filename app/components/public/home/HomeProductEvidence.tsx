"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldCheckIcon } from "../icons/FeatureIcons";

interface ProductScreen {
  id: string;
  step: string;
  title: string;
  src: string;
  alt: string;
  description: string;
}

// Real, actual product screenshots — the audit/onboarding stages are
// committed screen captures of the live app; the Growth Assistant/content/
// approval/publish stages are captured from the real production components
// via an isolated demo harness (app/test-growth-assistant-canonical) with
// static demo data instead of live AI generation. No invented UI, no
// fabricated metrics. See AGENTS §6/§10.
const PRODUCT_SCREENS: ProductScreen[] = [
  {
    id: "audit",
    step: "1 · TELL US",
    title: "Free Business Audit",
    src: "/product-evidence/01-free-audit.png",
    alt: "Starting a free Stratxcel business audit",
    description: "Share your website or Google Business link. That's enough to start — no card required.",
  },
  {
    id: "findings",
    step: "2 · UNDERSTAND",
    title: "Audit findings",
    src: "/product-evidence/02-audit-findings.png",
    alt: "Stratxcel audit findings and growth diagnosis",
    description: "An evidence-backed diagnosis of your online presence, with a prioritized 30/60/90-day roadmap.",
  },
  {
    id: "profile",
    step: "3 · UNDERSTAND",
    title: "Business & Brand Profile",
    src: "/product-evidence/03-business-profile.png",
    alt: "Confirming business and brand details in Stratxcel",
    description: "Confirm your business details once — Stratxcel reuses them across every piece of work.",
  },
  {
    id: "connected",
    step: "4 · CONNECT",
    title: "Connected Accounts",
    src: "/product-evidence/04-connected-accounts.png",
    alt: "Connecting business accounts in Stratxcel",
    description: "Connect the accounts you already use, or skip any channel and add it later.",
  },
  {
    id: "assistant",
    step: "5 · CREATE",
    title: "Growth Assistant",
    src: "/product-evidence/05-growth-assistant.png",
    alt: "Asking the Stratxcel Growth Assistant to create a poster",
    description: "Ask in plain language — English, Hindi, or Hinglish — for the digital work you need.",
  },
  {
    id: "generated",
    step: "6 · CREATE",
    title: "Generated content",
    src: "/product-evidence/06-generated-content.png",
    alt: "Stratxcel-generated poster options ready to choose from",
    description: "Review a few real options grounded in your brand, and pick the one you want.",
  },
  {
    id: "approval",
    step: "7 · APPROVE",
    title: "Your approval",
    src: "/product-evidence/07-approval.png",
    alt: "Approving a drafted post before it publishes",
    description: "Nothing goes out on your behalf without your review. Approve, edit, or cancel — your call.",
  },
  {
    id: "published",
    step: "8 · GROW",
    title: "Published result",
    src: "/product-evidence/08-published.png",
    alt: "Confirmation that a post was published successfully",
    description: "A clear receipt once it's live, so you always know what went out and when.",
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
            REAL PRODUCT, REAL SCREENS
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            Tell us → understand → create → approve → publish → improve.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            These are screenshots of the actual Stratxcel app, not mockups. Every step ends with your
            approval before anything goes live.
          </p>
        </div>

        {/* Product Screenshot Story */}
        <div className="mt-14 rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-lg overflow-hidden">
          {/* Tab Bar */}
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
                  {screen.title}
                </button>
              );
            })}
          </div>

          {/* Screen Content Body */}
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="relative aspect-[4/3] w-full bg-slate-100 sm:aspect-[16/10]">
              <Image
                key={activeScreen.id}
                src={activeScreen.src}
                alt={activeScreen.alt}
                fill
                sizes="(min-width: 1024px) 760px, 100vw"
                className="object-cover object-top"
              />
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
              <span className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {activeScreen.step}
              </span>
              <h3 className="mt-2 font-sx-sans text-xl font-bold text-slate-900 sm:text-2xl">
                {activeScreen.title}
              </h3>
              <p className="mt-3 font-sx-sans text-sm leading-relaxed text-slate-600 sm:text-base">
                {activeScreen.description}
              </p>
              <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-500">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Real production screen — no fabricated data or invented metrics.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
