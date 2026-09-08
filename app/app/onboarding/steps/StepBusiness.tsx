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
 * Per-field connection lifecycle for the Website and Google Maps inputs
 * below (STRATXCEL PRODUCTION REPAIR mission, Section 6): idle -> checking
 * -> connected | failed. Each field owns its own state -- entering a
 * website never affects the Google Maps field's state and vice versa,
 * unlike the previous single combined field where both landed as one
 * shared, ambiguous text box.
 */
type SourceCheckState = "idle" | "checking" | "connected" | "failed";

/**
 * StratXcel Onboarding reference step 1 (Business) — real business fields
 * plus a real, user-triggered discovery affordance (not auto-fired on
 * Continue like the previous implementation): "Find my business info
 * automatically" calls the real /api/platform/site-discovery/resolve
 * synthesis, shown as an honest idle → running → done/failed sequence. The
 * "done" summary shows only fields the real synthesis actually returns
 * (name/category/location) — no fabricated rating or review count, unlike
 * the reference's illustrative mockup data.
 *
 * Website and Google Maps/Business are two fully independent, optional
 * fields (mission Section 4/5/6/7) — each with its own real, non-blocking,
 * server-verified connection state, never a shared/ambiguous combined text
 * box. Website verification reuses the same real, SSRF-protected
 * reachability check (/api/platform/site-discovery/resolve ->
 * runSmartWebsiteDiscovery) the "Find my business info automatically"
 * button already relies on -- called per-field, in the background, on
 * blur. Google Maps verification is real URL-shape recognition
 * (validateAndNormalizeGoogleMapsInput, routed through the same server
 * endpoint rather than trusted client-side) -- deliberately labeled
 * "connected" rather than "verified": this codebase has no Google Places
 * API integration to confirm the place actually exists, and overclaiming
 * that would be exactly the fabricated-verification failure mode this
 * mission explicitly forbids. Real Google-verified location status is a
 * separate, later concept (Google Business Profile OAuth +
 * resolveEffectiveGbpVerificationState, commit 5b5b621) that this field
 * never claims to represent.
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
  const websiteId = useId();
  const mapsId = useId();

  const [websiteValue, setWebsiteValue] = useState(draft.business.website || "");
  const [websiteCheck, setWebsiteCheck] = useState<SourceCheckState>(draft.business.website ? "connected" : "idle");
  const [websiteCheckError, setWebsiteCheckError] = useState<string | null>(null);

  const [mapsValue, setMapsValue] = useState(draft.business.googleMapsUrl || "");
  const [mapsCheck, setMapsCheck] = useState<SourceCheckState>(draft.business.googleMapsUrl ? "connected" : "idle");
  const [mapsCheckError, setMapsCheckError] = useState<string | null>(null);

  async function checkWebsite(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setWebsiteCheck("idle");
      setWebsiteCheckError(null);
      update({ website: "" });
      return;
    }
    const normalized = normalizeWebsiteUrl(trimmed);
    if (!normalized.ok || !normalized.url) {
      setWebsiteCheck("failed");
      setWebsiteCheckError("That doesn't look like a valid website address.");
      return;
    }
    // Persist immediately -- verification is a non-blocking, best-effort
    // confirmation on top of an already-usable value (mission Section 8:
    // never freeze onboarding on a slow check).
    update({ website: normalized.url });
    setWebsiteCheck("checking");
    setWebsiteCheckError(null);
    try {
      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: normalized.url }),
      });
      const body = await res.json().catch(() => ({}));
      const reachable = Boolean(res.ok && (body?.data?.isReachable ?? body?.isSuccess));
      setWebsiteCheck(reachable ? "connected" : "failed");
      if (!reachable) setWebsiteCheckError("We couldn't connect to this website.");
    } catch {
      setWebsiteCheck("failed");
      setWebsiteCheckError("We couldn't connect to this website.");
    }
  }

  async function checkMaps(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setMapsCheck("idle");
      setMapsCheckError(null);
      update({ googleMapsUrl: "" });
      return;
    }
    setMapsCheck("checking");
    setMapsCheckError(null);
    try {
      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleMapsUrl: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      const canonicalUrl = body?.intelligence?.googleMapsUrl as string | undefined;
      // Fall back to client-side normalization if the server response
      // shape doesn't carry it back (keeps this resilient to that
      // endpoint's response evolving) -- the actual validation logic is
      // identical either way (validateAndNormalizeGoogleMapsInput).
      const localCheck = validateAndNormalizeGoogleMapsInput(trimmed);
      if (res.ok && (canonicalUrl || localCheck.success)) {
        const finalUrl = canonicalUrl || (localCheck.success ? localCheck.data.canonicalUrl : trimmed);
        update({
          googleMapsUrl: finalUrl,
          name: !draft.business.name && localCheck.success && localCheck.data.placeName ? localCheck.data.placeName : draft.business.name,
        });
        setMapsCheck("connected");
      } else {
        setMapsCheck("failed");
        setMapsCheckError("That doesn't look like a Google Maps or Business Profile link.");
      }
    } catch {
      setMapsCheck("failed");
      setMapsCheckError("Couldn't check this link right now.");
    }
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

        <FormField label="Website" htmlFor={websiteId} optional>
          <Input
            id={websiteId}
            value={websiteValue}
            onChange={(e) => setWebsiteValue(e.target.value)}
            onBlur={(e) => void checkWebsite(e.target.value)}
            placeholder="https://example.com or www.example.com"
            className="h-[46px] font-mono text-sm"
          />
          <SourceCheckHint
            state={websiteCheck}
            idleLabel="Connect your website"
            checkingLabel="Checking website…"
            connectedLabel="Website connected"
            failedLabel={websiteCheckError || "We couldn't connect to this website"}
            onRetry={() => void checkWebsite(websiteValue)}
          />
        </FormField>

        <FormField label="Google Business / Google Maps" htmlFor={mapsId} optional>
          <Input
            id={mapsId}
            value={mapsValue}
            onChange={(e) => setMapsValue(e.target.value)}
            onBlur={(e) => void checkMaps(e.target.value)}
            placeholder="Paste your Google Maps or Business Profile link"
            className="h-[46px] font-mono text-sm"
          />
          <SourceCheckHint
            state={mapsCheck}
            idleLabel="Connect Google Maps"
            checkingLabel="Checking Google location…"
            connectedLabel="Google location connected"
            failedLabel={mapsCheckError || "We couldn't recognize this Google Maps link"}
            onRetry={() => void checkMaps(mapsValue)}
          />
        </FormField>

        {discoveryState === "idle" && (
          <button
            type="button"
            onClick={() => onStartDiscovery(draft.business.website || websiteValue, draft.business.googleMapsUrl || mapsValue)}
            disabled={!websiteValue.trim() && !mapsValue.trim() && !draft.business.website && !draft.business.googleMapsUrl}
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

/**
 * Shared idle/checking/connected/failed hint row for the Website and
 * Google Maps fields -- same states, same visual language, always
 * non-blocking (never disables the field or the rest of the form while
 * checking or failed).
 */
function SourceCheckHint({
  state,
  idleLabel,
  checkingLabel,
  connectedLabel,
  failedLabel,
  onRetry,
}: {
  state: SourceCheckState;
  idleLabel: string;
  checkingLabel: string;
  connectedLabel: string;
  failedLabel: string;
  onRetry: () => void;
}) {
  if (state === "checking") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-sx-border-strong border-t-sx-accent" />
        <span className="text-xs text-sx-text-subtle">{checkingLabel}</span>
      </div>
    );
  }
  if (state === "connected") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
        <span className="text-xs font-medium text-sx-success">{connectedLabel}</span>
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-xs text-sx-danger">{failedLabel}</span>
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-sx-accent hover:underline">
          Retry
        </button>
      </div>
    );
  }
  return <p className="mt-1.5 text-xs text-sx-text-subtle">{idleLabel}</p>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-sx-text-subtle">{label}</span>
      <span className="text-[13px] font-semibold text-sx-text">{value}</span>
    </div>
  );
}
