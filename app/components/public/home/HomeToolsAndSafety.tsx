"use client";

import React from "react";
import Link from "next/link";
import {
  LockClosedIcon,
  ShieldCheckIcon,
  CheckIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

const INTEGRATION_ITEMS = [
  {
    name: "LinkedIn",
    category: "Professional Network",
    status: "CONNECTED",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Verified provider connector. Prepare and schedule organic posts for your review.",
  },
  {
    name: "Google Search Console",
    category: "Search Discovery",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Read-only property access to inspect rankings and search query volume.",
  },
  {
    name: "Google Analytics 4",
    category: "Traffic Insights",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Read-only traffic attribution to measure customer page visits and conversions.",
  },
  {
    name: "WhatsApp Business",
    category: "Inbound Inquiries",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Assisted connector to route incoming customer chats into your organized lead inbox.",
  },
  {
    name: "Instagram & Facebook",
    category: "Social Presence",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Stage weekly visual posts and native captions for 1-click publishing.",
  },
  {
    name: "Razorpay",
    category: "Payments",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Secure payment processing. Card and UPI credentials are never stored in app code.",
  },
  {
    name: "Google Drive",
    category: "Asset Storage",
    status: "AVAILABLE",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Store brand assets, logo files, and marketing media in your own storage bucket.",
  },
  {
    name: "Meta Ads Direct Connect",
    category: "Paid Advertising",
    status: "COMING SOON",
    badgeColor: "bg-slate-100 text-slate-600 border-slate-200",
    desc: "Campaign planning workflows active; direct self-serve API launch in progress.",
  },
  {
    name: "Domain Registrar Search",
    category: "Web Domains",
    status: "COMING SOON",
    badgeColor: "bg-slate-100 text-slate-600 border-slate-200",
    desc: "Integrated domain availability search and checkout on our product roadmap.",
  },
];

const SAFETY_PILLARS = [
  {
    title: "Strictly Private & Isolated",
    icon: <LockClosedIcon className="w-5 h-5 text-blue-600" />,
    desc: "Every business receives its own dedicated database schema. Your customer contacts and business numbers are never shared or pooled with other businesses.",
  },
  {
    title: "Human Approval Gate",
    icon: <ShieldCheckIcon className="w-5 h-5 text-blue-600" />,
    desc: "Stratxcel never publishes a post, spends ad budget, or sends messages autonomously. Everything waits in your dashboard for your 1-click confirmation.",
  },
  {
    title: "Zero Model Training",
    icon: <CheckIcon className="w-5 h-5 text-blue-600" />,
    desc: "Your private business conversations, pricing, and client details are never used to train third-party public AI models. Your IP remains 100% yours.",
  },
];

export function HomeToolsAndSafety() {
  return (
    <section id="integrations" className="border-t border-slate-200/80 bg-slate-50/50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            INTEGRATIONS & PRIVACY
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            Bring your business tools together.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Connect the software you already use. Stratxcel operates your daily tasks while your accounts and data stay strictly yours.
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_ITEMS.map((item) => (
            <div
              key={item.name}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-blue-200 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-sx-sans text-sm font-bold text-slate-900">
                    {item.name}
                  </h3>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${item.badgeColor}`}
                  >
                    {item.status}
                  </span>
                </div>
                <span className="block mt-0.5 text-[11px] font-medium text-slate-400">
                  {item.category}
                </span>
                <p className="mt-2.5 font-sx-sans text-xs leading-relaxed text-slate-600">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 3 Privacy & Governance Pillars */}
        <div className="mt-14 rounded-2xl border border-slate-200 bg-white p-6 sm:p-9 shadow-xs">
          <div className="max-w-2xl">
            <span className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-blue-600">
              Security & Privacy Guarantee
            </span>
            <h3 className="mt-1.5 font-sx-sans text-xl font-bold text-slate-900 sm:text-2xl">
              Safe, governed, and completely transparent.
            </h3>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {SAFETY_PILLARS.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-xs mb-3.5">
                  {p.icon}
                </div>
                <h4 className="font-sx-sans text-sm font-bold text-slate-900">
                  {p.title}
                </h4>
                <p className="mt-2 font-sx-sans text-xs leading-relaxed text-slate-600">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-5">
            <p className="font-sx-sans text-xs text-slate-500">
              Complete data ownership. You can export or delete your business data at any time.
            </p>
            <Link
              href="/security"
              className="inline-flex items-center gap-1 font-sx-sans text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <span>Read security details</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
