"use client";

import { useId, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { FormField } from "../FormField";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
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
  onIntelligenceSynthesized,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors?: { name?: string };
  onIntelligenceSynthesized?: (intelligence: any) => void;
}) {
  const nameId = useId();
  const websiteId = useId();
  const googleMapsId = useId();
  const locationId = useId();
  const industryId = useId();
  const modelId = useId();

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const lastScanned = useRef<string>("");

  const website = draft.business.website?.trim() || "";
  const gbp = draft.business.googleMapsUrl?.trim() || "";

  // Trigger background intelligence when website or GBP changes
  useEffect(() => {
    const key = `${website}|${gbp}|${draft.business.industry}`;
    if (!website && !gbp) return;
    if (key === lastScanned.current) return;

    const timeout = setTimeout(async () => {
      lastScanned.current = key;
      setAnalyzing(true);
      try {
        const res = await fetch("/api/platform/site-discovery/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websiteUrl: website || undefined,
            googleMapsUrl: gbp || undefined,
            industry: draft.business.industry || undefined,
            existingDraft: {
              businessName: draft.business.name,
              location: draft.business.location,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.intelligence && onIntelligenceSynthesized) {
            onIntelligenceSynthesized(data.intelligence);
            setAnalyzed(true);
          }
        }
      } catch {
        // Background intelligence trace - non-blocking
      } finally {
        setAnalyzing(false);
      }
    }, 1200);

    return () => clearTimeout(timeout);
  }, [website, gbp, draft.business.industry, draft.business.name, draft.business.location, onIntelligenceSynthesized]);

  function handleGbpChange(val: string) {
    const norm = validateAndNormalizeGoogleMapsInput(val);
    const cleanUrl = norm.success ? norm.data.canonicalUrl : val;
    const placeName = norm.success ? norm.data.placeName : undefined;
    update({
      googleMapsUrl: cleanUrl,
      name: !draft.business.name && placeName ? placeName : draft.business.name,
    });
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Tell us about your business</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          We&rsquo;ll use this information to understand your business and prepare your audit.
        </p>
      </div>

      {/* Subtle analysis status badge */}
      {analyzing ? (
        <div className="flex items-center gap-2 rounded-sx-md bg-sx-accent/10 border border-sx-accent/20 px-3.5 py-2 text-xs text-sx-accent font-medium animate-pulse">
          <span className="h-2 w-2 rounded-full bg-sx-accent animate-ping" />
          <span>Understanding your business signals in the background…</span>
        </div>
      ) : analyzed ? (
        <div className="flex items-center gap-2 rounded-sx-md bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-400 font-medium">
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

        {/* 2. Website / Domain */}
        <div>
          <FormField
            label="Website / Domain"
            htmlFor={websiteId}
            hint="Optional if you don't have a website yet."
          >
            <Input
              id={websiteId}
              type="url"
              value={draft.business.website}
              onChange={(e) => update({ website: e.target.value })}
              placeholder="https://example.com"
              className="h-11 font-mono text-sm"
            />
          </FormField>
        </div>

        {/* 3. Google Maps / Google Business Profile */}
        <div>
          <FormField
            label="Google Maps / Business Profile"
            htmlFor={googleMapsId}
            hint="Supports maps.app.goo.gl, google.com/maps, g.page"
          >
            <Input
              id={googleMapsId}
              value={draft.business.googleMapsUrl ?? ""}
              onChange={(e) => handleGbpChange(e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              className="h-11 font-mono text-sm"
            />
          </FormField>
        </div>

        {/* 4. Location / City */}
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

        {/* 5. Industry / Category */}
        <div>
          <FormField
            label="Industry / Category"
            htmlFor={industryId}
            hint="Choose the closest industry."
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
      </div>
    </div>
  );
}
