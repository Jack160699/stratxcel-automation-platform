"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { FormField } from "../FormField";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
import { normalizeWebsiteUrl } from "@/lib/identity/smart-url";
import type { OnboardingDraft } from "../types";

const INDUSTRY_OPTIONS = [
  "SaaS & Technology",
  "Healthcare & Clinics",
  "Food & Dining (Restaurants / Cafes)",
  "Salon & Beauty Services",
  "Professional Services & Consulting",
  "Real Estate & Architecture",
  "Retail & E-commerce",
  "Fitness & Wellness",
  "Automotive & Repair",
  "Education & Coaching",
  "Manufacturing & Industrial",
  "General Business",
];

const MODEL_OPTIONS = [
  { value: "B2B", label: "B2B (Selling to other businesses)" },
  { value: "B2C_LOCAL", label: "Local Storefront / Clinic / Dining (Walk-ins & local customers)" },
  { value: "SERVICE_AGENCY", label: "Service Provider / Agency (Appointments & custom projects)" },
  { value: "ONLINE_ECOMMERCE", label: "Online E-commerce / D2C (Nationwide / global shipping)" },
];

export function StepBusiness({
  draft,
  update,
  errors = {},
  isSynthesizing = false,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors?: { name?: string };
  isSynthesizing?: boolean;
}) {
  const nameId = useId();
  const websiteId = useId();
  const googleMapsId = useId();
  const locationId = useId();
  const industryId = useId();
  const modelId = useId();
  const servicesId = useId();

  const hasIntelligence = Boolean(
    draft.business.name ||
    draft.business.location ||
    draft.business.industry ||
    draft.business.website ||
    draft.business.googleMapsUrl
  );

  function handleGbpChange(val: string) {
    const trimmed = val.trim();
    if (!trimmed) {
      update({ googleMapsUrl: "" });
      return;
    }
    const norm = validateAndNormalizeGoogleMapsInput(trimmed);
    const cleanUrl = norm.success ? norm.data.canonicalUrl : val;
    const placeName = norm.success ? norm.data.placeName : undefined;
    update({
      googleMapsUrl: cleanUrl,
      name: !draft.business.name && placeName ? placeName : draft.business.name,
    });
  }

  function handleWebsiteBlur(val: string) {
    const trimmed = val.trim();
    if (!trimmed) return;
    const norm = normalizeWebsiteUrl(trimmed);
    if (norm.ok && norm.url) {
      update({ website: norm.url });
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Your business</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          We found most of this information for you. Check anything that looks wrong.
        </p>
      </div>

      {/* Intelligence Status Banner */}
      {isSynthesizing ? (
        <div className="flex items-center gap-2 rounded-sx-md bg-sx-accent/10 border border-sx-accent/20 px-3.5 py-2.5 text-xs text-sx-accent font-medium animate-pulse">
          <span className="h-2 w-2 rounded-full bg-sx-accent animate-ping" />
          <span>Analyzing your business signals in the background…</span>
        </div>
      ) : hasIntelligence ? (
        <div className="flex items-center gap-2 rounded-sx-md bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-400 font-medium">
          <span>✓</span>
          <span>Business signals analyzed. Relevant details pre-filled for your review.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 1. Business Name */}
        <div className="sm:col-span-2">
          <FormField
            label="Business Name"
            htmlFor={nameId}
            error={errors.name}
            hint="The public name of your company, clinic, or store."
          >
            <Input
              id={nameId}
              value={draft.business.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. StratXcel Solutions"
              className="h-11"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              required
            />
          </FormField>
        </div>

        {/* 2. Industry / Category */}
        <div>
          <FormField
            label="Industry / Category"
            htmlFor={industryId}
            hint="Select the closest industry for audit benchmarks."
          >
            <select
              id={industryId}
              value={draft.business.industry}
              onChange={(e) => update({ industry: e.target.value })}
              className="h-11 w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-sm text-sx-text focus:border-sx-accent focus:outline-hidden"
            >
              <option value="">Select an industry…</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* 3. Location / Operating City */}
        <div>
          <FormField
            label="Location / Operating City"
            htmlFor={locationId}
            hint="Where your primary customers or storefront are located."
          >
            <Input
              id={locationId}
              value={draft.business.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="e.g. Bhilai, Chhattisgarh, India"
              className="h-11"
            />
          </FormField>
        </div>

        {/* 4. Canonical Website (Pre-filled from Step 1) */}
        <div>
          <FormField
            label="Website"
            htmlFor={websiteId}
            hint="Pre-filled from Step 1. Edit if you need to make corrections."
          >
            <Input
              id={websiteId}
              type="text"
              value={draft.business.website}
              onChange={(e) => update({ website: e.target.value })}
              onBlur={(e) => handleWebsiteBlur(e.target.value)}
              placeholder="https://example.com"
              className="h-11 font-mono text-sm"
            />
          </FormField>
        </div>

        {/* 5. Google Maps / Google Business Profile (Pre-filled from Step 1) */}
        <div>
          <FormField
            label="Google Maps / Business Profile"
            htmlFor={googleMapsId}
            hint="Pre-filled from Step 1. Connected to your Google profile."
          >
            <Input
              id={googleMapsId}
              type="text"
              value={draft.business.googleMapsUrl ?? ""}
              onChange={(e) => handleGbpChange(e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              className="h-11 font-mono text-sm"
            />
          </FormField>
        </div>

        {/* 6. Business Model / Operating Type */}
        <div className="sm:col-span-2">
          <FormField
            label="Business Model"
            htmlFor={modelId}
            hint="Helps StratXcel tailor customer journey and audit benchmarks."
          >
            <select
              id={modelId}
              value={draft.business.businessModel ?? "B2B"}
              onChange={(e) => update({ businessModel: e.target.value })}
              className="h-11 w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-sm text-sx-text focus:border-sx-accent focus:outline-hidden"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* 7. Key Services / Offerings (if discovered) */}
        {draft.business.services && draft.business.services.length > 0 && (
          <div className="sm:col-span-2">
            <FormField
              label="Discovered Services / Offerings"
              htmlFor={servicesId}
              hint="Key services extracted from your website and profile signals."
            >
              <div className="flex flex-wrap gap-2 pt-1">
                {draft.business.services.map((svc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2.5 py-1 rounded-sx-sm bg-sx-surface-2 border border-sx-border text-xs text-sx-text font-medium"
                  >
                    ✓ {svc}
                  </span>
                ))}
              </div>
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
}
