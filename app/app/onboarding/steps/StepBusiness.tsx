"use client";

import { useId, useState } from "react";
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

export type DiscoveryState = "idle" | "running" | "done" | "failed";

/**
 * StratXcel Onboarding reference step 1 (Business) — real business fields
 * plus a real, user-triggered discovery affordance (not auto-fired on
 * Continue like the previous implementation): "Find my business info
 * automatically" calls the real /api/platform/site-discovery/resolve
 * synthesis, shown as an honest idle → running → done/failed sequence. The
 * "done" summary shows only fields the real synthesis actually returns
 * (name/category/location) — no fabricated rating or review count, unlike
 * the reference's illustrative mockup data.
 */
export function StepBusiness({
  draft,
  update,
  errors = {},
  discoveryState,
  onStartDiscovery,
  onResetDiscovery,
  errorField,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors?: { name?: string };
  discoveryState: DiscoveryState;
  onStartDiscovery: (websiteInput: string, gbpInput: string) => void;
  onResetDiscovery: () => void;
  errorField?: string | null;
}) {
  const nameId = useId();
  const industryId = useId();
  const locationId = useId();
  const linkId = useId();

  const [linkValue, setLinkValue] = useState(draft.business.website || draft.business.googleMapsUrl || "");
  const [linkError, setLinkError] = useState<string | null>(null);

  /**
   * Pure classification: given the raw link field text, resolve it to
   * {website, googleMapsUrl} without touching component/draft state. Used
   * both by classifyAndStoreLink (on blur, for persistence) and by the
   * "Find my business info automatically" button's onClick — the button
   * cannot rely on draft.business.website/googleMapsUrl alone because those
   * only commit on blur, and clicking the button directly after typing
   * (without first blurring the field) is a completely normal interaction
   * that must not leave the button silently non-functional.
   */
  function classifyLink(value: string): { website: string; googleMapsUrl: string; placeName?: string } {
    const trimmed = value.trim();
    if (!trimmed) return { website: "", googleMapsUrl: "" };
    const mapsResult = validateAndNormalizeGoogleMapsInput(trimmed);
    if (mapsResult.success) {
      return { website: "", googleMapsUrl: mapsResult.data.canonicalUrl, placeName: mapsResult.data.placeName };
    }
    const websiteResult = normalizeWebsiteUrl(trimmed);
    if (websiteResult.ok && websiteResult.url) {
      return { website: websiteResult.url, googleMapsUrl: "" };
    }
    // Neither a recognizable Maps link nor a valid website — keep the raw
    // text as a website candidate (non-blocking; this field is optional)
    // rather than reject input the user might still complete typing.
    return { website: trimmed, googleMapsUrl: "" };
  }

  function classifyAndStoreLink(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      update({ website: "", googleMapsUrl: "" });
      return;
    }
    const resolved = classifyLink(value);
    update({
      googleMapsUrl: resolved.googleMapsUrl,
      website: resolved.website,
      name: !draft.business.name && resolved.placeName ? resolved.placeName : draft.business.name,
    });
    setLinkError(null);
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <h2 className="font-sx-sans text-xl font-bold text-sx-text">Tell us about your business</h2>
      <p className="mb-5 text-sm leading-relaxed text-sx-text-muted">We&rsquo;ll use this to set up your profile and find you online.</p>

      <div className="flex flex-col gap-3.5">
        <FormField label="Business name" htmlFor={nameId} error={errors.name}>
          <Input
            id={nameId}
            value={draft.business.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Patel Daily Needs"
            className="h-[46px]"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            required
          />
        </FormField>

        <FormField label="Type of business" htmlFor={industryId}>
          <select
            id={industryId}
            value={draft.business.industry}
            onChange={(e) => update({ industry: e.target.value })}
            className="h-[46px] w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-[15px] text-sx-text focus:border-sx-accent focus:outline-none"
          >
            <option value="">Select…</option>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="City & area" htmlFor={locationId}>
          <Input
            id={locationId}
            value={draft.business.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="e.g. Navrangpura, Ahmedabad"
            className="h-[46px]"
          />
        </FormField>

        <FormField label="Website or Google Maps link" htmlFor={linkId} error={linkError ?? undefined} optional>
          <Input
            id={linkId}
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onBlur={(e) => classifyAndStoreLink(e.target.value)}
            placeholder="https://maps.google.com or your website…"
            className="h-[46px] font-mono text-sm"
          />
        </FormField>

        {discoveryState === "idle" && (
          <button
            type="button"
            onClick={() => {
              const resolved = classifyLink(linkValue);
              classifyAndStoreLink(linkValue);
              onStartDiscovery(resolved.website, resolved.googleMapsUrl);
            }}
            disabled={!linkValue.trim() && !draft.business.website && !draft.business.googleMapsUrl}
            className="flex h-[46px] items-center justify-center gap-2 rounded-sx-md border-[1.5px] border-dashed border-sx-accent/30 bg-sx-accent-muted text-[14px] font-semibold text-sx-accent disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            Find my business info automatically
          </button>
        )}

        {discoveryState === "running" && (
          <div className="relative overflow-hidden rounded-sx-md border-[1.5px] border-sx-accent/20 bg-sx-surface-1 p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 shrink-0 animate-spin rounded-full border-[2.5px] border-sx-border-strong border-t-sx-accent" />
              <div>
                <p className="text-[14px] font-semibold text-sx-text">Scanning your business online…</p>
                <p className="mt-0.5 text-xs text-sx-text-subtle">Checking Google, Maps, and your website</p>
              </div>
            </div>
          </div>
        )}

        {discoveryState === "done" && (
          <div className="rounded-sx-md border-[1.5px] border-sx-success/20 bg-sx-success/[0.04] p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sx-sm bg-sx-success/10">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <p className="text-[14px] font-semibold text-sx-success">Found your business!</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {draft.business.name && <SummaryRow label="Name" value={draft.business.name} />}
              {draft.business.industry && <SummaryRow label="Category" value={draft.business.industry} />}
              {draft.business.location && <SummaryRow label="Location" value={draft.business.location} />}
            </div>
            <p className="mt-2.5 text-xs text-sx-text-muted">Anything incorrect? You can update it above.</p>
          </div>
        )}

        {discoveryState === "failed" && (
          <div className="rounded-sx-md border-[1.5px] border-sx-warning/20 bg-sx-warning/[0.04] p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sx-sm bg-sx-warning/10">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-warning)" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </span>
              <p className="text-[14px] font-semibold text-sx-warning">Couldn&rsquo;t find your business automatically</p>
            </div>
            <p className="text-[13px] leading-relaxed text-sx-text-muted">
              {errorField || "That's fine — just fill in your details manually and we'll set everything up for you. You can add your Google Business link later."}
            </p>
            <button type="button" onClick={onResetDiscovery} className="mt-2.5 text-[13px] font-semibold text-sx-accent">
              Try again with a different link →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-sx-text-subtle">{label}</span>
      <span className="text-[13px] font-semibold text-sx-text">{value}</span>
    </div>
  );
}
