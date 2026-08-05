"use client";

import { useId } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import type { OnboardingDraft } from "../types";

/**
 * Seeds the real Brand Brain (packages/brand-brain) — business_name,
 * target_audience, tone_of_voice, products[], rules[] all map to typed
 * fields on BrandBrainContent and are written after the tenant exists.
 * "description" has no typed field on that contract yet, so it stays
 * labeled as draft-only rather than silently discarded or faked.
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

  return (
    <div className="flex flex-col gap-5">
      <FormField label="Brand / business name" htmlFor={nameId} optional hint="Defaults to your workspace name if left blank.">
        <Input
          id={nameId}
          value={draft.brand.businessName}
          onChange={(e) => update({ businessName: e.target.value })}
          placeholder={draft.brand.businessName ? undefined : "Same as workspace name"}
          className="h-11"
        />
      </FormField>

      <FormField
        label="Short description"
        htmlFor={descId}
        optional
        hint="This detail will be completed in Workspace Settings — Brand Brain doesn't have a saved-value field for it yet."
      >
        <Textarea id={descId} value={draft.brand.description} onChange={(e) => update({ description: e.target.value })} rows={2} />
      </FormField>

      <FormField label="Audience" htmlFor={audienceId} optional>
        <Input
          id={audienceId}
          value={draft.brand.audience}
          onChange={(e) => update({ audience: e.target.value })}
          placeholder="Who you're speaking to"
          className="h-11"
        />
      </FormField>

      <FormField label="Tone / personality" htmlFor={toneId} optional>
        <Input
          id={toneId}
          value={draft.brand.tone}
          onChange={(e) => update({ tone: e.target.value })}
          placeholder="e.g. Direct, warm, technical"
          className="h-11"
        />
      </FormField>

      <FormField label="Primary offers / services" htmlFor={offersId} optional hint="One per line.">
        <Textarea
          id={offersId}
          value={draft.brand.offers}
          onChange={(e) => update({ offers: e.target.value })}
          rows={3}
          placeholder={"e.g.\nBrand strategy\nSocial management"}
        />
      </FormField>

      <FormField label="Restrictions or claims to avoid" htmlFor={restrictionsId} optional hint="One per line.">
        <Textarea
          id={restrictionsId}
          value={draft.brand.restrictions}
          onChange={(e) => update({ restrictions: e.target.value })}
          rows={3}
          placeholder={"e.g.\nNever guarantee results\nNo competitor comparisons"}
        />
      </FormField>
    </div>
  );
}
