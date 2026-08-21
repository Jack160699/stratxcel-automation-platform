"use client";

import { useId } from "react";
import { Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import type { OnboardingDraft } from "../types";

/**
 * StratXcel Onboarding reference step 3 (Brand) — the one reference step
 * the previous implementation genuinely had no user-facing equivalent
 * for. All four fields are real, already-defined OnboardingDraft.brand
 * keys that the tenant-creation API already persists to Brand Brain
 * (app/api/platform/onboarding/route.ts) — this step just gives the user
 * a real place to type them.
 *
 * Deliberately does NOT auto-fill these with generic plausible-sounding
 * text when empty (a prior version of this file did exactly that — a
 * canned "Target customers seeking dependable {industry} solutions..."
 * sentence, silently saved into the tenant's real Brand Brain as if it
 * were a fact the customer stated). Every field here starts genuinely
 * empty; only what the customer actually types is submitted. The
 * reference's own copy says "Everything here is optional" for exactly
 * this reason.
 */
export function StepBrand({
  draft,
  update,
  onOpenConnector,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["brand"]>) => void;
  onOpenConnector: () => void;
}) {
  const offersId = useId();
  const descId = useId();
  const audienceId = useId();
  const restrictionsId = useId();
  const businessName = draft.business.name || "your business";

  return (
    <div className="flex w-full flex-col gap-1">
      <h2 className="font-sx-sans text-xl font-bold text-sx-text">What makes {businessName} special?</h2>
      <p className="mb-5 text-sm leading-relaxed text-sx-text-muted">
        This helps Growth Assistant write content that sounds like you. Everything here is optional.
      </p>

      <div className="flex flex-col gap-4">
        <FormField label="What do you sell or offer?" htmlFor={offersId}>
          <Textarea
            id={offersId}
            value={draft.brand.offers}
            onChange={(e) => update({ offers: e.target.value })}
            placeholder="e.g. Fresh groceries, daily essentials, snacks, and home delivery in the Navrangpura area"
            rows={3}
            className="text-[14px] leading-relaxed"
          />
        </FormField>

        <FormField
          label="What makes you stand out from other stores?"
          htmlFor={descId}
          hint="Your USP, special service, or what customers love about you"
        >
          <Textarea
            id={descId}
            value={draft.brand.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="e.g. Free delivery within 3 km, open 7 days, fresh stock daily…"
            rows={3}
            className="text-[14px] leading-relaxed"
          />
        </FormField>

        <FormField label="Who are your typical customers?" htmlFor={audienceId}>
          <Textarea
            id={audienceId}
            value={draft.brand.audience}
            onChange={(e) => update({ audience: e.target.value })}
            placeholder="e.g. Local families, working professionals in Navrangpura and Paldi"
            rows={2}
            className="text-[14px] leading-relaxed"
          />
        </FormField>

        <FormField
          label="Anything StratXcel should avoid saying?"
          htmlFor={restrictionsId}
          hint="Words or phrases that don't match your image"
        >
          <Textarea
            id={restrictionsId}
            value={draft.brand.restrictions}
            onChange={(e) => update({ restrictions: e.target.value })}
            placeholder={'e.g. "cheapest prices", "discount store"…'}
            rows={2}
            className="text-[14px] leading-relaxed"
          />
        </FormField>

        <button
          type="button"
          onClick={onOpenConnector}
          className="flex items-center gap-3 rounded-sx-md border-[1.5px] border-dashed border-sx-accent/25 bg-sx-accent-muted p-3.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-sx-accent">Connect your accounts — optional</span>
            <span className="mt-0.5 block text-xs text-sx-text-subtle">Google Business, WhatsApp · Skip for now, do it later</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2" className="shrink-0"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </div>
  );
}
