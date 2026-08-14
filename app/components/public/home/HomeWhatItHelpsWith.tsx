"use client";

import React from "react";
import Link from "next/link";
import {
  GlobeIcon,
  SearchIcon,
  DocumentTextIcon,
  ShareNodesIcon,
  UsersGroupIcon,
  TargetIcon,
  HandshakeIcon,
  ChartBarIcon,
  ArrowRightIcon,
} from "../icons/FeatureIcons";

const CAPABILITIES = [
  {
    id: "website",
    title: "Your Website",
    category: "Website & Pages",
    headline: "Keep your website updated and working properly.",
    desc: "Update product copy, fix formatting, add customer reviews, and ensure your site loads fast on mobile phones.",
    icon: <GlobeIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-website-agent",
    linkText: "Learn about website help",
  },
  {
    id: "seo",
    title: "Google Search",
    category: "Search & Discovery",
    headline: "Help more people find your business on Google.",
    desc: "Discover what keywords prospective clients search for, analyze nearby competitors, and produce helpful search-friendly articles.",
    icon: <SearchIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-seo-agent",
    linkText: "Learn about Google SEO",
  },
  {
    id: "content",
    title: "Content & Copy",
    category: "Writing & Briefs",
    headline: "Plan and create useful content for your audience.",
    desc: "Draft articles, service descriptions, email newsletters, and customer FAQs that follow your tone with zero fabricated claims.",
    icon: <DocumentTextIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-content-agent",
    linkText: "Learn about content drafting",
  },
  {
    id: "social",
    title: "Social Media",
    category: "Social Presence",
    headline: "Keep your social presence active and consistent.",
    desc: "Prepare a weekly calendar across LinkedIn, Instagram, and Facebook with platform-tailored captions and clean visuals.",
    icon: <ShareNodesIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-social-media-agent",
    linkText: "Learn about social autopilot",
  },
  {
    id: "crm",
    title: "Customer Inquiries",
    category: "Leads & Follow-ups",
    headline: "Keep track of leads and follow-ups.",
    desc: "Capture questions arriving from WhatsApp and web forms into one clean pipeline, with prepared reply drafts ready for you.",
    icon: <UsersGroupIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-crm-agent",
    linkText: "Learn about customer follow-ups",
  },
  {
    id: "marketing",
    title: "Marketing",
    category: "Reach & Campaigns",
    headline: "Find better ways to reach potential customers.",
    desc: "Plan campaign ideas, test marketing angles, and determine which channels bring the most interested buyers for your budget.",
    icon: <TargetIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-marketing-agent",
    linkText: "Learn about marketing reach",
  },
  {
    id: "sales",
    title: "Sales & Proposals",
    category: "Closing Customers",
    headline: "Help turn interested people into customers.",
    desc: "Structure customized quotes, prepare clear service proposals, and send timely follow-ups before leads cool down.",
    icon: <HandshakeIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-business-automation",
    linkText: "Learn about sales assistance",
  },
  {
    id: "reporting",
    title: "Weekly Reporting",
    category: "Insights & Direction",
    headline: "See what is working and where you should focus next.",
    desc: "Receive a simple 1-page weekly summary showing traffic, new inquiries, customer trends, and suggested priorities.",
    icon: <ChartBarIcon className="w-5 h-5 text-blue-600" />,
    link: "/ai-business-agent",
    linkText: "Learn about business insights",
  },
];

export function HomeWhatItHelpsWith() {
  return (
    <section className="border-t border-slate-200/80 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            CAPABILITIES
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,2.8rem)] font-bold tracking-tight text-slate-900 leading-tight">
            What Stratxcel helps you handle.
          </h2>
          <p className="mt-4 font-sx-sans text-base leading-relaxed text-slate-600 sm:text-lg">
            Practical help across the eight digital areas that matter most for growing a modern business.
          </p>
        </div>

        {/* 8 Capability Cards Grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/40 p-6 transition-all hover:border-blue-200 hover:bg-white hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-100/80">
                    {cap.icon}
                  </div>
                  <span className="font-sx-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                    {cap.category}
                  </span>
                </div>

                <h3 className="mt-4 font-sx-sans text-base font-bold text-slate-900">
                  {cap.title}
                </h3>
                <p className="mt-1 font-sx-sans text-xs font-semibold text-blue-700">
                  {cap.headline}
                </p>
                <p className="mt-2.5 font-sx-sans text-xs leading-relaxed text-slate-600">
                  {cap.desc}
                </p>
              </div>

              <div className="mt-6 border-t border-slate-200/60 pt-3">
                <Link
                  href={cap.link}
                  className="inline-flex items-center gap-1 font-sx-sans text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  <span>{cap.linkText}</span>
                  <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
