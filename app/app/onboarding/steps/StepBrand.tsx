"use client";

import { useId, useEffect } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import type { OnboardingDraft } from "../types";

/**
 * StepBrand: Seeds Brand Brain with evidence-based intelligence and pre-filled fields.
 *
 * Pre-populates Brand Name, Description, Target Audience, Tone of Voice,
 * Primary Offers, and Restrictions from synthesized business intelligence.
 */
export function StepBrand({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["brand"]>) => void;
}) {
  const nameId = useId();
  const descId = useId();
  const audienceId = useId();
  const toneId = useId();
  const offersId = useId();
  const restrictionsId = useId();

  // Smart fallback if fields are empty upon navigating to Brand step
  useEffect(() => {
    const patch: Partial<OnboardingDraft["brand"]> = {};
    const bizName = draft.business.name || draft.brand.businessName || "My Business";
    const ind = draft.business.industry || "General Business";

    if (!draft.brand.businessName && draft.business.name) {
      patch.businessName = draft.business.name;
    }
    if (!draft.brand.tone) {
      patch.tone = ind.toLowerCase().includes("saas") || ind.toLowerCase().includes("tech")
        ? "Authoritative, modern, analytical, and practical"
        : ind.toLowerCase().includes("food") || ind.toLowerCase().includes("dining")
        ? "Warm, inviting, artisanal, and community-focused"
        : ind.toLowerCase().includes("clinic") || ind.toLowerCase().includes("health")
        ? "Professional, caring, trustworthy, and empathetic"
        : "Professional, trustworthy, approachable, and customer-focused";
    }
    if (!draft.brand.audience) {
      patch.audience = `Target customers and clients seeking dependable ${ind} solutions with ${bizName}.`;
    }
    if (!draft.brand.description) {
      patch.description = `${bizName} provides specialized ${ind} offerings focused on dependable quality, customer satisfaction, and consistent value.`;
    }
    if (!draft.brand.offers && draft.business.services && draft.business.services.length > 0) {
      patch.offers = draft.business.services.slice(0, 5).join("\n");
    }
    if (!draft.brand.restrictions) {
      patch.restrictions = [
        "Do not guarantee specific revenue multiples without verified scope",
        "No unverified performance comparisons with named competitors",
        "Maintain clear customer satisfaction guidelines across communications",
      ].join("\n");
    }

    if (Object.keys(patch).length > 0) {
      update(patch);
    }
  }, [draft.business, draft.brand, update]);

  const hasIntelligence = Boolean(draft.brand.description || draft.brand.audience || draft.brand.tone);

  return (
    <div className="flex flex-col gap-5 w-full">
      {hasIntelligence && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-sx-md bg-sx-surface-2 border border-sx-border/80 text-xs text-sx-text-muted">
          <span className="text-sx-success font-bold">✓</span>
          <span>We&rsquo;ve pre-filled your brand profile from discovered business intelligence. Please verify or adjust below.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Brand / business name" htmlFor={nameId} optional hint="Defaults to workspace name if blank.">
          <Input
            id={nameId}
            value={draft.brand.businessName}
            onChange={(e) => update({ businessName: e.target.value })}
            placeholder={draft.brand.businessName ? undefined : "Same as workspace name"}
            className="h-11"
          />
        </FormField>

        <FormField label="Tone / personality" htmlFor={toneId} optional hint="Inferred from brand language & industry">
          <Input
            id={toneId}
            value={draft.brand.tone}
            onChange={(e) => update({ tone: e.target.value })}
            placeholder="e.g. Direct, warm, consultative"
            className="h-11"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Target audience" htmlFor={audienceId} optional hint="Who your business primarily serves">
          <Input
            id={audienceId}
            value={draft.brand.audience}
            onChange={(e) => update({ audience: e.target.value })}
            placeholder="Who you're speaking to"
            className="h-11"
          />
        </FormField>

        <FormField
          label="Short description"
          htmlFor={descId}
          optional
          hint="Completed further in Workspace Settings."
        >
          <Input
            id={descId}
            value={draft.brand.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Brief summary of what your business does and why it matters"
            className="h-11"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Primary offers / services" htmlFor={offersId} optional hint="One per line.">
          <Textarea
            id={offersId}
            value={draft.brand.offers}
            onChange={(e) => update({ offers: e.target.value })}
            rows={3}
            placeholder={"e.g.\nBrand strategy\nSocial management\nAI Automation"}
          />
        </FormField>

        <FormField label="Restrictions or claims to avoid" htmlFor={restrictionsId} optional hint="One per line. Safe compliance guidelines.">
          <Textarea
            id={restrictionsId}
            value={draft.brand.restrictions}
            onChange={(e) => update({ restrictions: e.target.value })}
            rows={3}
            placeholder={"e.g.\nNever guarantee results\nNo competitor comparisons"}
          />
        </FormField>
      </div>
    </div>
  );
}
