"use client";

import Link from "next/link";
import type { BusinessMilestone } from "@/lib/journey/business-journey";

export function AchievementMoment({ milestone }: { milestone: BusinessMilestone }) {
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] border border-emerald-500/30 bg-gradient-to-r from-emerald-950/20 via-sx-surface-1 to-sx-surface-1 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Milestone Achieved
            </span>
            <span className="text-xs font-semibold text-sx-text-subtle">
              {milestone.title}
            </span>
          </div>

          <h3 className="font-sx-sans text-lg font-bold text-sx-text sm:text-xl">
            {milestone.description}
          </h3>

          <p className="text-xs text-sx-text-muted sm:text-sm">
            <span className="font-semibold text-sx-text">Business Impact:</span> {milestone.businessImpact}
          </p>

          <div className="pt-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sx-text-subtle">
              What was accomplished:
            </p>
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {milestone.whatWasAccomplished.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-sx-text">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start sm:items-end gap-2 pt-2 sm:pt-0">
          <Link
            href={milestone.nextStep.href}
            className="inline-flex min-h-10 items-center justify-center rounded-sx-sm bg-emerald-500 px-4 text-xs font-bold text-sx-accent-on transition-colors hover:bg-emerald-400 sm:text-sm"
          >
            {milestone.nextStep.label} →
          </Link>
          <span className="text-[10px] text-sx-text-subtle">Recommended next step</span>
        </div>
      </div>
    </div>
  );
}
