"use client";

import { useId } from "react";
import { Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import { PLAN_TIERS, type OnboardingDraft } from "../types";

/**
 * No billing/subscription table exists anywhere in this schema
 * (confirmed against supabase/migrations/ — app/app/billing/page.tsx
 * already says this plainly: "Plan management ... has no backend yet").
 * This step never activates anything — it records a non-binding request
 * Stratxcel will confirm, using the same tier names as the public
 * /pricing page.
 */
export function StepPlan({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["plan"]>) => void;
}) {
  const noteId = useId();

  return (
    <div className="flex flex-col gap-4">
      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        This is a request, not an activation — no payment happens here. Stratxcel will follow up to confirm engagement
        details.
      </p>
      <div role="radiogroup" aria-label="Requested engagement tier" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {PLAN_TIERS.map((tier) => {
          const isSelected = draft.plan.tier === tier.key;
          return (
            <button
              key={tier.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => update({ tier: tier.key })}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-sx-md border px-3.5 py-2.5 text-left transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
                isSelected
                  ? "border-sx-accent bg-[rgb(58_160_255_/_0.08)]"
                  : "border-sx-border-strong bg-sx-surface-2 hover:bg-sx-elevated"
              }`}
            >
              <span className="font-sx-sans text-[13px] font-semibold text-sx-text">{tier.name}</span>
              <span className="font-sx-sans text-[12px] leading-snug text-sx-text-muted">{tier.pitch}</span>
            </button>
          );
        })}
      </div>

      <FormField label="Anything else to tell us?" htmlFor={noteId} optional>
        <Textarea id={noteId} value={draft.plan.note} onChange={(e) => update({ note: e.target.value })} rows={2} />
      </FormField>
    </div>
  );
}
