"use client";

import React from "react";

const BENEFITS = [
  { label: "SAVE TIME", description: "Less manual digital workload every week" },
  { label: "REDUCE COSTS", description: "No expensive agency overheads" },
  { label: "BETTER QUALITY", description: "Grounded in your business truth" },
  { label: "MORE CUSTOMERS", description: "Organic search & clear landing pages" },
  { label: "BETTER FOLLOW-UP", description: "Zero missed WhatsApp or form leads" },
  { label: "FASTER GROWTH", description: "Continuous execution with human sign-off" },
];

export function HomeBenefitStrip() {
  return (
    <section
      aria-label="Core Business Benefits"
      className="border-y border-slate-200/80 bg-slate-50/70 py-6"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {BENEFITS.map((b) => (
            <div
              key={b.label}
              className="flex flex-col items-center justify-center text-center p-2 rounded-xl transition-colors hover:bg-white/80"
            >
              <span className="font-sx-mono text-[11px] sm:text-xs font-bold tracking-[0.14em] text-blue-700">
                {b.label}
              </span>
              <span className="mt-1 font-sx-sans text-[11px] sm:text-xs text-slate-600 font-medium leading-tight">
                {b.description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
