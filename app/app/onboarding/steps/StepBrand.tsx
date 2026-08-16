"use client";

import { useId, useEffect } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { FormField } from "../FormField";
import type { OnboardingDraft } from "../types";

export function StepBrand({
  draft,
  update,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["brand"]>) => void;
}) {
  const descId = useId();
  const audienceId = useId();
  const toneId = useId();
  const offersId = useId();
  const restrictionsId = useId();

  // Smart fallback prefill if fields are empty
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

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Help StratXcel understand how your business should sound</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          These guidelines ensure all AI content, audit analyses, and automated responses match your voice.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-sx-md bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-400 font-medium">
        <span>✓</span>
        <span>Pre-filled from your business information. You can edit any field below.</span>
      </div>

      <div className="flex flex-col gap-4">
        {/* 1. Brand Description */}
        <FormField
          label="Short Business Description"
          htmlFor={descId}
          hint="Summarize what your business does and why customers choose you."
        >
          <Textarea
            id={descId}
            value={draft.brand.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Tell us what you do..."
            rows={2}
            className="text-sm leading-relaxed"
          />
        </FormField>

        {/* 2. Target Audience & Tone in 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Target Audience"
            htmlFor={audienceId}
            hint="Who are your ideal customers?"
          >
            <Input
              id={audienceId}
              value={draft.brand.audience}
              onChange={(e) => update({ audience: e.target.value })}
              placeholder="e.g. Local homeowners, founders, clinics"
              className="h-11"
            />
          </FormField>

          <FormField
            label="Tone of Voice"
            htmlFor={toneId}
            hint="How your communications should feel."
          >
            <Input
              id={toneId}
              value={draft.brand.tone}
              onChange={(e) => update({ tone: e.target.value })}
              placeholder="e.g. Professional, friendly, direct"
              className="h-11"
            />
          </FormField>
        </div>

        {/* 3. Primary Offers / Services */}
        <FormField
          label="Primary Services / Offers"
          htmlFor={offersId}
          hint="Enter your top offerings (one per line)."
        >
          <Textarea
            id={offersId}
            value={draft.brand.offers}
            onChange={(e) => update({ offers: e.target.value })}
            placeholder="e.g. Automated Social Publishing&#10;WhatsApp CRM Receptionist&#10;Local SEO Audits"
            rows={3}
            className="text-sm font-mono"
          />
        </FormField>

        {/* 4. Things to Avoid */}
        <FormField
          label="Important Things to Avoid"
          htmlFor={restrictionsId}
          hint="Rules and topics AI should never mention."
        >
          <Textarea
            id={restrictionsId}
            value={draft.brand.restrictions}
            onChange={(e) => update({ restrictions: e.target.value })}
            placeholder="e.g. No unverified revenue guarantees"
            rows={2}
            className="text-sm"
          />
        </FormField>
      </div>
    </div>
  );
}
