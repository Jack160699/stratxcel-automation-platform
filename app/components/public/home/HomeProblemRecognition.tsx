"use client";

import React from "react";
import {
  GlobeIcon,
  ShareNodesIcon,
  ChatBubbleIcon,
  SearchIcon,
} from "../icons/FeatureIcons";

const PAIN_POINTS = [
  {
    title: "The Website Delay",
    icon: <GlobeIcon className="w-5 h-5 text-slate-700" />,
    desc: "Your website needs updates, new offers, or copy tweaks, but web developers take weeks or charge expensive retainer fees.",
    impact: "Outdated pages lose customer trust.",
  },
  {
    title: "The Social Drain",
    icon: <ShareNodesIcon className="w-5 h-5 text-slate-700" />,
    desc: "You know consistent posting brings visibility, but brainstorming ideas, writing captions, and formatting images every week is exhausting.",
    impact: "Channels sit silent for weeks.",
  },
  {
    title: "The Missed Inquiries",
    icon: <ChatBubbleIcon className="w-5 h-5 text-slate-700" />,
    desc: "Customer questions arrive on WhatsApp, email, and forms. On busy days, inquiries sit unanswered and leads turn elsewhere.",
    impact: "Lost sales and frustrated buyers.",
  },
  {
    title: "The Search Mystery",
    icon: <SearchIcon className="w-5 h-5 text-slate-700" />,
    desc: "Competitors rank higher when local clients search on Google, but technical SEO guidance feels complicated and full of jargon.",
    impact: "Missed organic customer discovery.",
  },
];

export function HomeProblemRecognition() {
  return (
    <section className="border-t border-slate-200/80 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            THE DAILY REALITY
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            Running a business shouldn&apos;t feel like running five jobs at once.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Most business owners spend valuable time juggling digital tasks instead of focusing on what they do best: serving customers and building their business.
          </p>
        </div>

        {/* 4 Pain Point Cards */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PAIN_POINTS.map((item) => (
            <div
              key={item.title}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
            >
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200/80 shadow-xs">
                  {item.icon}
                </div>
                <h3 className="mt-4 font-sx-sans text-base font-bold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 font-sx-sans text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  {item.desc}
                </p>
              </div>

              <div className="mt-6 border-t border-slate-200/60 pt-3">
                <span className="font-sx-mono text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                  Outcome: {item.impact}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
