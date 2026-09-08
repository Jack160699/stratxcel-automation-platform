"use client";

import { useEffect, useId, useRef, useState } from "react";
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
 * STRATXCEL BUSINESS DISCOVERY redesign: search-first Google Business/Maps
 * lifecycle (mission Section 18). idle -> searching (debounced autocomplete
 * in flight) -> selecting (a suggestion tapped, real Place Details +
 * website auto-discovery in flight) -> connected | failed. "analyzing"
 * covers the same in-flight window as "selecting" from the customer's
 * perspective (one combined request) but gets its own copy once a place is
 * confirmed, distinguishing "found the business" from "now checking its
 * website" the way the mission's target UX describes.
 */
type GoogleDiscoveryFlowState = "idle" | "searching" | "selecting" | "analyzing" | "connected" | "failed";

interface PlaceAutocompleteSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

interface SelectedPlaceSummary {
  name: string;
  address: string | null;
  category: string | null;
  rating: number | null;
  userRatingCount: number | null;
  websiteUri: string | null;
  /**
   * Whether the auto-discovered website's crawl actually succeeded, not
   * just whether Google reported a URL. Live-proven necessary: a real
   * hotel chain's own website returned HTTP 403 to the crawler during
   * testing -- Google genuinely has a website on file, but this codebase
   * could not read it. Distinguishing "found" from "found and readable" is
   * the difference between an honest and a false "analyzed" claim.
   */
  websiteAnalyzed: boolean | null;
}

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
  onSelectGooglePlace,
  errorField,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors?: { name?: string };
  discoveryState: DiscoveryState;
  onStartDiscovery: (websiteInput: string, gbpInput: string) => void;
  onResetDiscovery: () => void;
  onSelectGooglePlace: (placeId: string) => Promise<{
    ok: boolean;
    googlePlace?: Record<string, unknown>;
    discoveredWebsiteUrl?: string;
    websiteAnalyzed?: boolean;
    error?: string;
  }>;
  errorField?: string | null;
}) {
  const nameId = useId();
  const industryId = useId();
  const locationId = useId();
  const websiteId = useId();
  const mapsId = useId();
  const businessSearchId = useId();

  const [websiteValue, setWebsiteValue] = useState(draft.business.website || "");
  const [websiteCheck, setWebsiteCheck] = useState<SourceCheckState>(draft.business.website ? "connected" : "idle");
  const [websiteCheckError, setWebsiteCheckError] = useState<string | null>(null);

  const [mapsValue, setMapsValue] = useState(draft.business.googleMapsUrl || "");
  const [mapsCheck, setMapsCheck] = useState<SourceCheckState>(draft.business.googleMapsUrl ? "connected" : "idle");
  const [mapsCheckError, setMapsCheckError] = useState<string | null>(null);

  // Search-first Google Business discovery (mission Section 1/2) -- the
  // PRIMARY path. "Paste Google Maps link instead" (below) reveals the
  // existing checkMaps field/flow above unchanged for customers who prefer
  // it or once we learn business search genuinely isn't available in this
  // deployment (no Places API key configured -- honest degrade, never a
  // dead search box).
  const [showPasteMapsLink, setShowPasteMapsLink] = useState(false);
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [googleFlow, setGoogleFlow] = useState<GoogleDiscoveryFlowState>(draft.business.googleMapsUrl ? "connected" : "idle");
  const [googleFlowError, setGoogleFlowError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlaceSummary | null>(null);
  const [websiteAutoDiscovering, setWebsiteAutoDiscovering] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  function scheduleSearch(query: string) {
    setBusinessSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => void runSearch(trimmed), 300);
  }

  async function runSearch(query: string) {
    setGoogleFlow((prev) => (prev === "connected" ? prev : "searching"));
    try {
      const res = await fetch(
        `/api/platform/onboarding/business-search/suggest?q=${encodeURIComponent(query)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      if (body.available === false) {
        // Honest degrade -- no Places API key configured in this
        // deployment. Switch to the paste-link path rather than leaving a
        // search box that will never show anything.
        setPlacesUnavailable(true);
        setShowPasteMapsLink(true);
        setSuggestions([]);
        setShowSuggestions(false);
        setGoogleFlow(draft.business.googleMapsUrl ? "connected" : "idle");
        return;
      }
      setSuggestions(body.suggestions ?? []);
      setShowSuggestions(true);
      setGoogleFlow(draft.business.googleMapsUrl ? "connected" : "idle");
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
      setGoogleFlow(draft.business.googleMapsUrl ? "connected" : "idle");
    }
  }

  async function selectSuggestion(suggestion: PlaceAutocompleteSuggestion) {
    setShowSuggestions(false);
    setBusinessSearchQuery(suggestion.mainText);
    setGoogleFlow("selecting");
    setGoogleFlowError(null);

    const result = await onSelectGooglePlace(suggestion.placeId);
    if (!result.ok) {
      setGoogleFlow("failed");
      setGoogleFlowError(result.error || "Couldn't load this business. Please try again.");
      return;
    }

    const place = result.googlePlace ?? {};
    setSelectedPlace({
      name: (place.displayName as string) || suggestion.mainText,
      address: (place.formattedAddress as string) || null,
      category: (place.category as string) || null,
      rating: (place.rating as number) ?? null,
      userRatingCount: (place.userRatingCount as number) ?? null,
      websiteUri: (place.websiteUri as string) || null,
      websiteAnalyzed: result.discoveredWebsiteUrl ? Boolean(result.websiteAnalyzed) : null,
    });
    setMapsCheck("connected");
    setMapsValue((place.googleMapsUri as string) || suggestion.mainText);

    if (result.discoveredWebsiteUrl) {
      setWebsiteAutoDiscovering(true);
      setGoogleFlow("analyzing");
      // The resolve call already ran the real website discovery+analysis
      // server-side (single convergent pipeline) -- this is just reflecting
      // that real, already-completed result in the Website field's own
      // state, not a second check. Google having a website on file doesn't
      // guarantee this codebase could actually read it (a real site can
      // block automated crawlers) -- reflect the real outcome, not just
      // the URL's existence.
      //
      // Live-caught real bug: setWebsiteValue alone only updates this
      // component's own local display state -- it never reaches
      // draft.business.website, the field the tenant-creation API
      // actually reads at Continue/Launch. Without an explicit update(),
      // the Website field visibly showed "connected" with a real URL, but
      // that URL was silently never saved anywhere (confirmed live: it
      // vanished on a fresh page load, since server-side draft persistence
      // only ever saves what update() commits).
      //
      // Guarded, not unconditional: applySynthesizedIntelligence (which
      // already ran, synchronously, inside the awaited onSelectGooglePlace
      // above) never overwrites an already-set draft.business.website --
      // checking the same condition here (plus the local input, for a
      // value the customer is mid-typing but hasn't blurred/saved yet)
      // keeps this call consistent with that same never-overwrite
      // guarantee, rather than blindly replacing a website the customer
      // already provided themselves.
      if (!websiteValue.trim() && !draft.business.website) {
        update({ website: result.discoveredWebsiteUrl });
        setWebsiteValue(result.discoveredWebsiteUrl);
        if (result.websiteAnalyzed) {
          setWebsiteCheck("connected");
        } else {
          setWebsiteCheck("failed");
          setWebsiteCheckError("Google has this website on file, but we couldn't read it automatically.");
        }
      }
      setTimeout(() => {
        setWebsiteAutoDiscovering(false);
        setGoogleFlow("connected");
      }, 600);
    } else {
      setGoogleFlow("connected");
    }
    // Fresh session for the next search, if the customer changes their mind.
    sessionTokenRef.current = crypto.randomUUID();
  }

  function resetGoogleSelection() {
    setSelectedPlace(null);
    setGoogleFlow("idle");
    setGoogleFlowError(null);
    setBusinessSearchQuery("");
    setMapsValue("");
    setMapsCheck("idle");
    update({ googleMapsUrl: "" });
  }

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

        <FormField label="Google Business / Google Maps" htmlFor={businessSearchId} optional>
          {selectedPlace ? (
            <div className="rounded-sx-md border-[1.5px] border-sx-success/25 bg-sx-success/[0.04] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-sx-text">{selectedPlace.name}</p>
                  {selectedPlace.address && <p className="mt-0.5 truncate text-xs text-sx-text-subtle">{selectedPlace.address}</p>}
                  {(selectedPlace.category || selectedPlace.rating != null) && (
                    <p className="mt-0.5 text-xs text-sx-text-subtle">
                      {selectedPlace.category}
                      {selectedPlace.category && selectedPlace.rating != null ? " · " : ""}
                      {selectedPlace.rating != null && `★ ${selectedPlace.rating}${selectedPlace.userRatingCount ? ` (${selectedPlace.userRatingCount})` : ""}`}
                    </p>
                  )}
                </div>
                <button type="button" onClick={resetGoogleSelection} className="shrink-0 text-xs font-semibold text-sx-text-subtle hover:text-sx-danger">
                  Change
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <SourceCheckHint
                  state="connected"
                  idleLabel=""
                  checkingLabel=""
                  connectedLabel="Business selected"
                  failedLabel=""
                  onRetry={() => {}}
                />
                {websiteAutoDiscovering ? (
                  <div className="flex items-center gap-1.5">
                    <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-sx-border-strong border-t-sx-accent" />
                    <span className="text-xs text-sx-text-subtle">Analyzing website…</span>
                  </div>
                ) : selectedPlace.websiteUri && selectedPlace.websiteAnalyzed ? (
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                    <span className="text-xs font-medium text-sx-success">Website found &amp; analyzed</span>
                  </div>
                ) : selectedPlace.websiteUri ? (
                  // Google has a website on file, but the real crawl
                  // couldn't read it (a real site can block automated
                  // fetches) -- honest about the actual outcome, not just
                  // that a URL exists (mission: never claim success the
                  // API call itself didn't achieve).
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sx-warning)" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <span className="text-xs font-medium text-sx-warning">Website found, but couldn&rsquo;t be analyzed automatically</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : showPasteMapsLink ? (
            <>
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
              {!placesUnavailable && (
                <button type="button" onClick={() => setShowPasteMapsLink(false)} className="mt-1.5 self-start text-xs font-semibold text-sx-accent hover:underline">
                  ← Search by business name instead
                </button>
              )}
            </>
          ) : (
            <div className="relative">
              <Input
                id={businessSearchId}
                value={businessSearchQuery}
                onChange={(e) => scheduleSearch(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search your business name…"
                className="h-[46px]"
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-1 shadow-lg">
                  {suggestions.map((s) => (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void selectSuggestion(s)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-sx-surface-2"
                      >
                        <span className="text-[14px] font-medium text-sx-text">{s.mainText}</span>
                        {s.secondaryText && <span className="text-xs text-sx-text-subtle">{s.secondaryText}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {googleFlow === "searching" && (
                <p className="mt-1.5 text-xs text-sx-text-subtle">Searching…</p>
              )}
              {googleFlow === "selecting" && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-sx-border-strong border-t-sx-accent" />
                  <span className="text-xs text-sx-text-subtle">Analyzing Google Business…</span>
                </div>
              )}
              {googleFlow === "failed" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-sx-danger">{googleFlowError}</span>
                  <button type="button" onClick={() => setGoogleFlow("idle")} className="text-xs font-semibold text-sx-accent hover:underline">
                    Retry
                  </button>
                </div>
              )}
              {googleFlow === "idle" && !businessSearchQuery && (
                <p className="mt-1.5 text-xs text-sx-text-subtle">Connect Google Maps</p>
              )}
              <button type="button" onClick={() => setShowPasteMapsLink(true)} className="mt-1.5 text-xs font-semibold text-sx-accent hover:underline">
                Paste Google Maps link instead
              </button>
            </div>
          )}
        </FormField>

        {/* A search-selected place already ran full discovery (name, website
           auto-discovery + analysis) as part of selection above -- this
           manual button is only useful for the paste-link/website-only
           paths, which don't trigger discovery automatically. */}
        {discoveryState === "idle" && !selectedPlace && (
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
