"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { FormField } from "../FormField";
import { slugify, type OnboardingDraft } from "../types";

export function StepBusiness({
  draft,
  update,
  errors,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors: { name?: string; slug?: string };
}) {
  const nameId = useId();
  const slugId = useId();
  const industryId = useId();
  const websiteId = useId();
  const locationId = useId();

  return (
    <div className="flex flex-col gap-5">
      <FormField label="Business / workspace name" htmlFor={nameId} error={errors.name}>
        <Input
          id={nameId}
          value={draft.business.name}
          onChange={(e) => {
            const name = e.target.value;
            update({ name, slug: draft.business.slugTouched ? draft.business.slug : slugify(name) });
          }}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          placeholder="Acme Retail"
          autoFocus
          className="h-11"
        />
      </FormField>

      <FormField label="Workspace URL slug" htmlFor={slugId} error={errors.slug} hint="Lowercase letters, numbers, and hyphens only.">
        <Input
          id={slugId}
          value={draft.business.slug}
          onChange={(e) => update({ slug: slugify(e.target.value), slugTouched: true })}
          aria-invalid={!!errors.slug}
          aria-describedby={errors.slug ? `${slugId}-error` : `${slugId}-hint`}
          placeholder="acme-retail"
          className="h-11"
        />
      </FormField>

      <FormField label="Industry / category" htmlFor={industryId} optional>
        <Input
          id={industryId}
          value={draft.business.industry}
          onChange={(e) => update({ industry: e.target.value })}
          placeholder="e.g. Retail, SaaS, Hospitality"
          className="h-11"
        />
      </FormField>

      <FormField label="Website" htmlFor={websiteId} optional hint="This detail will be completed in Workspace Settings — there's no saved-value field for it yet.">
        <Input
          id={websiteId}
          type="url"
          value={draft.business.website}
          onChange={(e) => update({ website: e.target.value })}
          aria-describedby={`${websiteId}-hint`}
          placeholder="https://acme.example.com"
          className="h-11"
        />
      </FormField>

      <FormField label="Primary operating location" htmlFor={locationId} optional hint="This detail will be completed in Workspace Settings — there's no saved-value field for it yet.">
        <Input
          id={locationId}
          value={draft.business.location}
          onChange={(e) => update({ location: e.target.value })}
          aria-describedby={`${locationId}-hint`}
          placeholder="City, country"
          className="h-11"
        />
      </FormField>
    </div>
  );
}
