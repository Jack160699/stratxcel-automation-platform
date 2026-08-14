"use client";

import Link from "next/link";
import type { BusinessJourneyState } from "@/lib/journey/business-journey";

export function BusinessJourneyHeader({ journey }: { journey: BusinessJourneyState }) {
  const active = journey.stages[journey.currentStageIndex];

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-sx-border bg-gradient-to-br from-sx-surface-1 via-sx-surface-1 to-sx-surface-2 p-5 shadow-sm sm:p-6">
      {/* Top Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sx-accent/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sx-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-sx-accent animate-pulse" />
              Business Journey
            </span>
            <span className="text-xs font-medium text-sx-text-subtle">
              Stage {journey.currentStageIndex + 1} of {journey.totalStages}
            </span>
          </div>
          <h2 className="mt-1 font-sx-sans text-xl font-bold tracking-tight text-sx-text sm:text-2xl">
            {active.summary}
          </h2>
          <p className="mt-1 text-xs text-sx-text-muted sm:text-sm">
            {active.detail}
          </p>
        </div>

        {active.action && (
          <div className="flex shrink-0 items-center">
            <Link
              href={active.action.href}
              className="inline-flex min-h-10 items-center justify-center rounded-sx-sm bg-sx-accent px-4 text-xs font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] sm:text-sm"
            >
              {active.action.label} →
            </Link>
          </div>
        )}
      </div>

      {/* Connected Dots/Lines Journey Progress Track */}
      <div className="mt-6 pt-4 border-t border-sx-border/60">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-0">
          {journey.stages.map((stage, idx) => {
            const isCompleted = stage.status === "Complete";
            const isActive = idx === journey.currentStageIndex;
            const isPending = stage.status === "Not started";

            return (
              <div key={stage.key} className="relative flex flex-col items-center sm:items-start group">
                {/* Connecting Line between dots (Desktop) */}
                {idx < journey.stages.length - 1 && (
                  <div
                    className={`hidden sm:block absolute top-[11px] left-[24px] right-0 h-[2px] z-0 transition-colors ${
                      isCompleted ? "bg-sx-accent" : "bg-sx-border"
                    }`}
                  />
                )}

                {/* Node & Dot */}
                <div className="relative z-10 flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                      isCompleted
                        ? "bg-sx-accent text-sx-accent-on ring-2 ring-sx-accent/30"
                        : isActive
                        ? "bg-sx-surface-1 border-2 border-sx-accent text-sx-accent ring-4 ring-sx-accent/20"
                        : "bg-sx-surface-2 border border-sx-border text-sx-text-subtle"
                    }`}
                  >
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <span
                    className={`text-xs font-semibold sm:hidden ${
                      isActive ? "text-sx-text font-bold" : isCompleted ? "text-sx-text-muted" : "text-sx-text-subtle"
                    }`}
                  >
                    {stage.shortLabel}
                  </span>
                </div>

                {/* Label (Desktop) */}
                <div className="hidden sm:flex flex-col mt-2 pr-2">
                  <span
                    className={`text-xs font-semibold ${
                      isActive
                        ? "text-sx-text font-bold"
                        : isCompleted
                        ? "text-sx-text-muted"
                        : "text-sx-text-subtle"
                    }`}
                  >
                    {stage.shortLabel}
                  </span>
                  <span className="text-[10px] text-sx-text-subtle">
                    {stage.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress & Context Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-sx-sm bg-sx-surface-2/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-sx-text-muted">
          <span className="font-semibold text-sx-text">What Stratxcel is doing:</span>
          <span>{active.whatStratxcelDoes}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-sx-accent">
            {journey.overallProgressPercent}% Realized
          </span>
        </div>
      </div>
    </div>
  );
}
