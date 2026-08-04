"use client";

import { SERVICE_CATALOGUE } from "@stratxcel/missions";

/**
 * Reuses the real service catalogue (packages/missions/src/service-catalogue)
 * instead of inventing a second goals taxonomy. Selections are recorded as
 * an audit_events entry once the workspace is created — they personalize
 * nothing automatically and never create a mission on their own (no fake
 * missions).
 */
export function StepGoals({ selected, onToggle }: { selected: string[]; onToggle: (key: string) => void }) {
  const options = SERVICE_CATALOGUE.filter((entry) => entry.key !== "custom_mission");

  return (
    <div className="flex flex-col gap-4">
      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        What do you want Stratxcel to help with first? Pick as many as apply — this is optional and just helps us point you
        at the right place to start.
      </p>
      <div role="group" aria-label="Initial goals" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((entry) => {
          const isSelected = selected.includes(entry.key);
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(entry.key)}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-sx-md border px-3.5 py-2.5 text-left transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                isSelected
                  ? "border-sx-accent bg-[rgb(58_160_255_/_0.08)]"
                  : "border-sx-border-strong bg-sx-surface-2 hover:bg-sx-elevated"
              }`}
            >
              <span className="font-sx-sans text-[13px] font-semibold text-sx-text">{entry.label}</span>
              <span className="font-sx-sans text-[12px] leading-snug text-sx-text-muted">{entry.description}</span>
            </button>
          );
        })}
      </div>
      <p className="font-sx-sans text-[11.5px] text-sx-text-subtle">
        Recorded against your workspace as a request — nothing is auto-created from these selections.
      </p>
    </div>
  );
}
