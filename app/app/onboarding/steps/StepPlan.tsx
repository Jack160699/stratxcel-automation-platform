"use client";

import { useId } from "react";
import { Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import { PLAN_TIERS, type OnboardingDraft } from "../types";

export function StepPlan({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["plan"]>) => void;
}) {
  const noteId = useId();
  const stage = draft.business.stage ?? "NEW/STARTING";
  const isEarlyStage = stage === "IDEA" || stage === "PRE-LAUNCH";

  return (
    <div className="flex flex-col gap-5">
      {/* Contextual Recommendation / From This -> To This Transformation Card */}
      <div className="rounded-sx-md border border-sx-border/80 bg-sx-surface-2 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-sx-accent">
          {isEarlyStage ? "Recommended Launch Roadmap" : "Recommended 30-Day Growth Transformation"}
        </p>
        <h3 className="mt-1 font-sx-sans text-sm font-semibold text-sx-text">
          {isEarlyStage
            ? "Your Stage: Pre-Launch Foundation"
            : `Your Stage: ${stage} — Active Business Growth`}
        </h3>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-sx-sm bg-sx-surface-1 p-3 border border-sx-border/60">
            <span className="font-semibold text-rose-400 block mb-1">CURRENT GAPS</span>
            <ul className="list-disc pl-4 space-y-1 text-sx-text-muted">
              {isEarlyStage ? (
                <>
                  <li>No live customer website</li>
                  <li>No connected social channels</li>
                  <li>Unverified contact channels</li>
                  <li>Scattered digital footprint</li>
                </>
              ) : (
                <>
                  <li>Inconsistent brand publishing</li>
                  <li>Untapped audience growth</li>
                  <li>Unoptimized channel presence</li>
                  <li>Untapped local & AI search discoverability</li>
                </>
              )}
            </ul>
          </div>

          <div className="rounded-sx-sm bg-sx-surface-1 p-3 border border-emerald-500/30">
            <span className="font-semibold text-emerald-400 block mb-1">30-DAY TARGET</span>
            <ul className="list-disc pl-4 space-y-1 text-sx-text-muted">
              {isEarlyStage ? (
                <>
                  <li>High-converting live website & domain</li>
                  <li>Active multi-channel social setup</li>
                  <li>Verified WhatsApp alert routing</li>
                  <li>Established brand foundation</li>
                </>
              ) : (
                <>
                  <li>Daily automated content publishing</li>
                  <li>Active Social Copilot campaigns</li>
                  <li>Multi-channel audience expansion</li>
                  <li>Optimized local presence & reviews</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-3 rounded-sx-sm bg-sx-surface-1/60 p-2.5 text-xs text-sx-text">
          <span className="font-semibold text-sx-accent">Recommended sequence: </span>
          {isEarlyStage
            ? "1. Website → 2. Social presence → 3. Brand identity → 4. WhatsApp verification → 5. Initial campaigns"
            : "1. Brand Brain verification → 2. Social Autopilot → 3. Copilot campaigns → 4. Discovery optimization"}
        </div>
      </div>

      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        This is a request, not an activation — no payment happens here. Stratxcel will follow up to confirm engagement
        details.
      </p>

      <div role="radiogroup" aria-label="Requested engagement tier" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

