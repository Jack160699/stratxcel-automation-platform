"use client";

import { SERVICE_CATALOGUE } from "@stratxcel/missions";
import type { OnboardingDraft } from "../types";

/**
 * StepGoals: Intelligent goal recommendations powered by the business profile.
 *
 * Reuses the canonical service catalogue (packages/missions/src/service-catalogue)
 * and highlights recommended starting goals for the customer's specific industry and digital presence.
 */
export function StepGoals({
  draft,
  selected,
  onToggle,
}: {
  draft: OnboardingDraft;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const recommendedKeys = draft.recommendedGoals ?? [];

  // Filter out internal/custom entries and sort recommended goals first
  const options = SERVICE_CATALOGUE
    .filter((entry) => entry.key !== "custom_mission" && entry.key !== "owner_operating_brain_context")
    .sort((a, b) => {
      const aRec = recommendedKeys.includes(a.key);
      const bRec = recommendedKeys.includes(b.key);
      if (aRec && !bRec) return -1;
      if (!aRec && bRec) return 1;
      return 0;
    });

  const industryLabel = draft.business.industry?.trim() || "business";

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Recommended banner */}
      <div className="flex items-start sm:items-center gap-2.5 px-4 py-3 rounded-sx-md bg-sx-accent/10 border border-sx-accent/25 text-xs text-sx-accent-strong font-medium leading-relaxed">
        <span className="text-sm">✨</span>
        <span>
          Based on your <strong>{industryLabel}</strong> profile, we&rsquo;ve pre-selected recommended starting goals. You can adjust them anytime.
        </span>
      </div>

      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        What do you want Stratxcel to focus on first? Pick as many as apply:
      </p>

      <div role="group" aria-label="Initial goals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((entry) => {
          const isSelected = selected.includes(entry.key);
          const isRecommended = recommendedKeys.includes(entry.key);

          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(entry.key)}
              className={`flex min-h-11 flex-col items-start justify-between gap-1.5 rounded-sx-md border px-3.5 py-3 text-left transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                isSelected
                  ? "border-sx-accent bg-[rgb(58_160_255_/_0.08)] ring-1 ring-sx-accent/30 shadow-2xs"
                  : "border-sx-border-strong bg-sx-surface-2 hover:bg-sx-elevated"
              }`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <span className="font-sx-sans text-[13px] font-semibold text-sx-text">{entry.label}</span>
                {isRecommended && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-sx-pill bg-sx-accent/15 text-sx-accent text-[10px] font-semibold tracking-wide shrink-0">
                    Recommended
                  </span>
                )}
              </div>
              <span className="font-sx-sans text-[12px] leading-snug text-sx-text-muted">{entry.description}</span>
            </button>
          );
        })}
      </div>

      <p className="font-sx-sans text-[11.5px] text-sx-text-subtle">
        Recorded against your workspace as a request — you can change these goals anytime from your Command Center.
      </p>
    </div>
  );
}
