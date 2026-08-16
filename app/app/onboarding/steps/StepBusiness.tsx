"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { slugify, type OnboardingDraft, type DiscoveredSocialDraft } from "../types";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { DiscoveredSocialLink } from "@/lib/identity/smart-url";
import { validateAndNormalizeSocialInput } from "@/lib/identity/social-normalizer";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";

type DiscoveryStatus = "idle" | "validating" | "fetching" | "discovering" | "complete" | "partial" | "failed" | "timeout";

export function StepBusiness({
  draft,
  update,
  errors,
  onIntelligenceSynthesized,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft["business"]>) => void;
  errors: { name?: string; slug?: string };
  onIntelligenceSynthesized?: (intelligence: any) => void;
}) {
  const nameId = useId();
  const slugId = useId();
  const industryId = useId();
  const websiteId = useId();
  const googleMapsId = useId();
  const locationId = useId();
  const stageId = useId();
  const modelId = useId();

  const [discoveryState, setDiscoveryState] = useState<DiscoveryStatus>("idle");
  const [discoveryMessage, setDiscoveryMessage] = useState<string>("");
  const [discoveredSocials, setDiscoveredSocials] = useState<DiscoveredSocialLink[]>(() => {
    if (draft.business.socials && draft.business.socials.length > 0) {
      return draft.business.socials.map((s) => ({
        platform: s.platform as any,
        url: s.url,
        handle: s.handle,
        rawHref: s.url,
        isCustom: false,
      }));
    }
    return [];
  });
  const [confirmedSocials, setConfirmedSocials] = useState<Set<string>>(() => {
    if (draft.business.socials && draft.business.socials.length > 0) {
      return new Set(draft.business.socials.filter((s) => s.confirmed !== false).map((s) => s.url));
    }
    return new Set();
  });
  const [rejectedSocials, setRejectedSocials] = useState<Set<string>>(() => {
    if (draft.business.socials && draft.business.socials.length > 0) {
      return new Set(draft.business.socials.filter((s) => s.confirmed === false).map((s) => s.url));
    }
    return new Set();
  });

  // Replacement workflow state machine
  const [replacingPlatform, setReplacingPlatform] = useState<string | null>(null);
  const [replacementInputs, setReplacementInputs] = useState<Record<string, string>>({});
  const [replacementErrors, setReplacementErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (draft.business.socials && draft.business.socials.length > 0 && discoveredSocials.length === 0) {
      setDiscoveredSocials(
        draft.business.socials.map((s) => ({
          platform: s.platform as any,
          url: s.url,
          handle: s.handle,
          rawHref: s.url,
          isCustom: false,
        }))
      );
      setConfirmedSocials(new Set(draft.business.socials.filter((s) => s.confirmed !== false).map((s) => s.url)));
      setRejectedSocials(new Set(draft.business.socials.filter((s) => s.confirmed === false).map((s) => s.url)));
    }
  }, [draft.business.socials]);

  async function handleRunDiscovery() {
    const websiteToScan = draft.business.website?.trim() || "";
    const gbpToScan = draft.business.googleMapsUrl?.trim() || "";

    if (!websiteToScan && !gbpToScan && !draft.business.industry?.trim()) {
      return;
    }

    setDiscoveryState("validating");
    setDiscoveryMessage("Validating presence and security checks...");

    try {
      setDiscoveryState("fetching");
      const targetLabel = websiteToScan || gbpToScan || "business profile";
      setDiscoveryMessage(`Connecting to ${targetLabel}...`);

      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: websiteToScan,
          googleMapsUrl: gbpToScan,
          industry: draft.business.industry?.trim() || undefined,
          confirmedSocials: draft.business.socials?.filter((s) => s.confirmed !== false),
          existingDraft: {
            businessName: draft.business.name,
            location: draft.business.location,
            whatsapp: draft.business.whatsapp,
          },
        }),
      });

      const body = await res.json();

      if (body.finalState === "FAILED" || body.finalState === "TIMEOUT") {
        setDiscoveryState(body.finalState === "TIMEOUT" ? "timeout" : "failed");
        setDiscoveryMessage(body.error ?? "Discovery could not be fully completed.");
        return;
      }

      setDiscoveryState(body.finalState === "COMPLETE" ? "complete" : "partial");
      setDiscoveryMessage(
        body.finalState === "COMPLETE"
          ? "✓ Business profile, brand signals & goals prepared!"
          : "Partial business information discovered."
      );

      // 1. Auto-populate discovered social links if found
      if (body.data?.socialLinks && Array.isArray(body.data.socialLinks)) {
        setDiscoveredSocials(body.data.socialLinks);
        const confirmedSet = new Set<string>(body.data.socialLinks.map((s: DiscoveredSocialLink) => s.url));
        setConfirmedSocials(confirmedSet);
      }

      // 2. Pass synthesized intelligence to wizard to pre-populate Business, Brand, Goals
      if (body.intelligence && onIntelligenceSynthesized) {
        onIntelligenceSynthesized(body.intelligence);
      } else {
        // Fallback direct business updates
        const updates: Partial<OnboardingDraft["business"]> = {};
        if (body.data?.websiteUrl) updates.website = body.data.websiteUrl;
        if (body.data?.businessName && (!draft.business.name || !draft.business.slugTouched)) {
          updates.name = body.data.businessName;
          updates.slug = slugify(body.data.businessName);
        }
        if (body.data?.location && !draft.business.location) {
          updates.location = body.data.location;
        }
        if (body.data?.industry && !draft.business.industry) {
          updates.industry = body.data.industry;
        }
        if (body.data?.businessModel) {
          updates.businessModel = body.data.businessModel;
        }
        if (body.data?.services && Array.isArray(body.data.services)) {
          updates.services = body.data.services;
        }
        if (body.data?.primaryOffer) {
          updates.primaryOffer = body.data.primaryOffer;
        }
        update(updates);
      }
    } catch {
      setDiscoveryState("failed");
      setDiscoveryMessage("Business analysis failed. You can continue filling details manually.");
    }
  }

  function handleSelectMine(social: DiscoveredSocialLink) {
    setConfirmedSocials((prev) => new Set([...prev, social.url]));
    setRejectedSocials((prev) => {
      const next = new Set(prev);
      next.delete(social.url);
      return next;
    });
    setReplacingPlatform((prev) => (prev === social.platform ? null : prev));
    const currentSocials = (draft.business.socials ?? []).map((s) => (s.url === social.url ? { ...s, confirmed: true } : s));
    if (!currentSocials.some((s) => s.url === social.url)) {
      currentSocials.push({ platform: social.platform, url: social.url, handle: social.handle, confirmed: true });
    }
    update({ socials: currentSocials });
  }

  function handleSelectNotMine(social: DiscoveredSocialLink) {
    setRejectedSocials((prev) => new Set([...prev, social.url]));
    setConfirmedSocials((prev) => {
      const next = new Set(prev);
      next.delete(social.url);
      return next;
    });
    setReplacingPlatform(social.platform);
    setReplacementInputs((prev) => ({
      ...prev,
      [social.platform]: prev[social.platform] ?? (social.isCustom ? social.handle : ""),
    }));
    setReplacementErrors((prev) => ({ ...prev, [social.platform]: "" }));
  }

  function handleSubmitReplacement(social: DiscoveredSocialLink) {
    const rawInput = replacementInputs[social.platform] ?? "";
    const result = validateAndNormalizeSocialInput(social.platform, rawInput);

    if (!result.success) {
      setReplacementErrors((prev) => ({ ...prev, [social.platform]: result.error }));
      return;
    }

    const normalized = result.data;
    const oldUrl = social.url;

    // Update discovered socials list with the replaced item
    setDiscoveredSocials((prev) =>
      prev.map((s) =>
        s.platform === social.platform
          ? {
              ...s,
              url: normalized.url,
              handle: normalized.handle,
              rawHref: normalized.url,
              isCustom: true,
            }
          : s
      )
    );

    // Update confirmation states
    setConfirmedSocials((prev) => {
      const next = new Set(prev);
      next.delete(oldUrl);
      next.add(normalized.url);
      return next;
    });
    setRejectedSocials((prev) => {
      const next = new Set(prev);
      next.delete(oldUrl);
      next.delete(normalized.url);
      return next;
    });

    // Update parent draft state
    const currentSocials = (draft.business.socials ?? []).filter((s) => s.platform !== social.platform && s.url !== oldUrl);
    currentSocials.push({
      platform: normalized.platform,
      url: normalized.url,
      handle: normalized.handle,
      confirmed: true,
    });
    update({ socials: currentSocials });

    // Close replacement panel & clear errors
    setReplacingPlatform(null);
    setReplacementErrors((prev) => ({ ...prev, [social.platform]: "" }));
  }

  const isScanning = discoveryState === "validating" || discoveryState === "fetching" || discoveryState === "discovering";
  const hasInputToScan = Boolean(draft.business.website?.trim() || draft.business.googleMapsUrl?.trim());

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Primary Discovery Card: Website + Google Maps / GBP */}
      <div className="rounded-sx-md bg-sx-surface-2 p-5 sm:p-6 border border-sx-border/60 w-full shadow-xs">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-sx-text">Tell us where your business exists online</h3>
          <p className="text-xs text-sx-text-muted mt-0.5">
            We&rsquo;ll automatically discover your services, reviews, brand language, and public channels.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          {/* Website Input */}
          <FormField
            label="Website / Domain"
            htmlFor={websiteId}
            hint="e.g. yourbusiness.com or https://mycompany.in"
          >
            <Input
              id={websiteId}
              type="text"
              value={draft.business.website}
              onChange={(e) => update({ website: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRunDiscovery();
                }
              }}
              placeholder="e.g. https://yourbusiness.com"
              className="h-11 w-full"
              autoFocus
            />
          </FormField>

          {/* Google Maps / Business Profile Input */}
          <FormField
            label="Google Maps / Business Profile"
            htmlFor={googleMapsId}
            hint="Paste your Google Maps link to extract reviews, location & services"
          >
            <Input
              id={googleMapsId}
              type="text"
              value={draft.business.googleMapsUrl || ""}
              onChange={(e) => update({ googleMapsUrl: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRunDiscovery();
                }
              }}
              placeholder="e.g. https://maps.app.goo.gl/... or google.com/maps/place/..."
              className="h-11 w-full"
            />
          </FormField>
        </div>

        {/* Scan & Auto-Fill Action Row */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-sx-border/40">
          <div className="text-xs text-sx-text-subtle">
            {discoveryState === "complete" ? (
              <span className="text-sx-success font-medium flex items-center gap-1.5">
                <span>✓</span> Business profile & brand signals synthesized
              </span>
            ) : isScanning ? (
              <span className="text-sx-accent font-medium flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-sx-accent animate-pulse" />
                {discoveryMessage}
              </span>
            ) : (
              <span>Provide your website or Google Maps link to auto-fill your profile and goals.</span>
            )}
          </div>

          <Button
            variant="primary"
            onClick={handleRunDiscovery}
            disabled={isScanning || !hasInputToScan}
            className="h-10 px-6 font-medium shrink-0 self-end sm:self-auto"
          >
            {isScanning ? "Scanning…" : "Scan & Auto-Fill"}
          </Button>
        </div>

        {/* Failure Retry Row */}
        {(discoveryState === "failed" || discoveryState === "timeout") && (
          <div className="mt-3.5 text-xs flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-sx-danger/20">
            <span className="text-sx-danger font-medium">{discoveryMessage}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleRunDiscovery}>
                Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDiscoveryState("idle")}>
                Continue anyway
              </Button>
            </div>
          </div>
        )}

        {/* Discovered Social Profiles Confirmation List */}
        {discoveredSocials.length > 0 && (
          <div className="mt-5 pt-4 border-t border-sx-border flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-sx-text">Discovered Social Channels</span>
                <p className="text-xs text-sx-text-muted mt-0.5">Confirm your official brand profiles or replace any incorrect account</p>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {discoveredSocials.map((social) => {
                const isConfirmed = confirmedSocials.has(social.url);
                const isRejected = rejectedSocials.has(social.url);
                const isReplacing = replacingPlatform === social.platform;
                const platformLabel = social.platform.charAt(0).toUpperCase() + social.platform.slice(1);

                return (
                  <div
                    key={social.url + social.platform}
                    className={`flex flex-col justify-between gap-3 p-4 rounded-sx-md border transition-all ${
                      isConfirmed
                        ? "bg-sx-surface-1 border-sx-success/50 shadow-xs ring-1 ring-sx-success/20"
                        : isRejected
                        ? "bg-sx-surface-2/60 border-sx-border/80"
                        : "bg-sx-surface-1 border-sx-border shadow-2xs hover:border-sx-border-strong"
                    }`}
                  >
                    {/* Header Row: Icon + Account Info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-sx-sm bg-sx-surface-2 border border-sx-border shrink-0 mt-0.5">
                        <PlatformIcon name={social.platform === "x" ? "threads" : (social.platform as any)} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-sx-text-subtle">{platformLabel}</span>
                          {isConfirmed && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-sx-pill bg-sx-success/15 text-sx-success text-[10.5px] font-semibold">
                              ✓ Confirmed
                            </span>
                          )}
                          {social.isCustom && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-sx-pill bg-sx-accent/15 text-sx-accent text-[10.5px] font-medium">
                              User Provided
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-sm text-sx-text break-all mt-0.5">{social.handle}</p>
                        <p className="text-[11px] text-sx-text-subtle break-all font-mono mt-0.5 line-clamp-1 hover:line-clamp-none">{social.url}</p>
                      </div>
                    </div>

                    {/* Action Controls Row */}
                    {!isReplacing && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-sx-border/40">
                        {isConfirmed ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[11.5px] font-medium text-sx-success flex items-center gap-1">
                              ✓ Verified for your brand
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectNotMine(social)}
                              className="text-[11.5px] text-sx-text-muted hover:text-sx-text underline cursor-pointer"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleSelectMine(social)}
                              className="flex-1 min-h-8.5 px-3 py-1.5 rounded-sx-sm text-xs font-semibold bg-sx-surface-2 text-sx-text hover:bg-sx-success hover:text-white border border-sx-border transition-colors text-center"
                            >
                              ✓ Mine
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSelectNotMine(social)}
                              className="flex-1 min-h-8.5 px-3 py-1.5 rounded-sx-sm text-xs font-medium text-sx-text-muted hover:text-sx-danger hover:bg-sx-danger/10 border border-transparent transition-colors text-center"
                            >
                              Not mine
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inline Account Replacement Workflow */}
                    {isReplacing && (
                      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-sx-border bg-sx-surface-2/80 p-3 rounded-sx-sm">
                        <label className="text-xs font-medium text-sx-text">
                          Enter your real {platformLabel} account:
                        </label>
                        <div className="flex flex-col gap-1.5">
                          <Input
                            type="text"
                            value={replacementInputs[social.platform] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setReplacementInputs((prev) => ({ ...prev, [social.platform]: val }));
                              if (replacementErrors[social.platform]) {
                                setReplacementErrors((prev) => ({ ...prev, [social.platform]: "" }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmitReplacement(social);
                              }
                            }}
                            placeholder={
                              social.platform === "instagram"
                                ? "@yourbrand or instagram.com/yourbrand"
                                : social.platform === "youtube"
                                ? "@YourChannel or youtube.com/@YourChannel"
                                : social.platform === "whatsapp"
                                ? "+91 98765 43210"
                                : `Your ${platformLabel} URL or handle`
                            }
                            className="h-9 text-xs w-full bg-sx-surface-1"
                            autoFocus
                          />
                          {replacementErrors[social.platform] && (
                            <p className="text-[11px] text-sx-danger font-medium leading-tight">
                              {replacementErrors[social.platform]}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplacingPlatform(null);
                              setReplacementErrors((prev) => ({ ...prev, [social.platform]: "" }));
                            }}
                            className="h-7 text-xs px-2.5"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleSubmitReplacement(social)}
                            className="h-7 text-xs px-3 font-medium"
                          >
                            Use this account
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Workspace & Business Identity Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Business name" htmlFor={nameId} error={errors.name}>
          <Input
            id={nameId}
            value={draft.business.name}
            onChange={(e) => {
              const name = e.target.value;
              update({
                name,
                slug: draft.business.slugTouched ? draft.business.slug : slugify(name),
              });
            }}
            placeholder="Acme Studio"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            className="h-11"
          />
        </FormField>

        <FormField
          label="Workspace slug"
          htmlFor={slugId}
          error={errors.slug}
          hint="Permanent workspace identifier. Lowercase letters, numbers, hyphens."
        >
          <Input
            id={slugId}
            value={draft.business.slug}
            onChange={(e) =>
              update({
                slug: slugify(e.target.value),
                slugTouched: true,
              })
            }
            placeholder="acme-studio"
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={errors.slug ? `${slugId}-error` : `${slugId}-hint`}
            className="h-11 font-mono text-sm"
          />
        </FormField>
      </div>

      {/* 3. Operational & Industry Signals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <FormField label="Industry / Category" htmlFor={industryId} hint="Guides tone & goals">
          <Input
            id={industryId}
            value={draft.business.industry}
            onChange={(e) => update({ industry: e.target.value })}
            placeholder="e.g. SaaS, Clinic, Bakery, Agency"
            className="h-11"
          />
        </FormField>

        <FormField label="Business model" htmlFor={modelId} hint="Inferred automatically">
          <Input
            id={modelId}
            value={draft.business.businessModel}
            onChange={(e) => update({ businessModel: e.target.value })}
            placeholder="e.g. B2B Services, Local Store"
            className="h-11"
          />
        </FormField>

        <FormField label="Primary location" htmlFor={locationId} hint="Locality or City">
          <Input
            id={locationId}
            value={draft.business.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="e.g. Bhilai, Chhattisgarh, IN"
            className="h-11"
          />
        </FormField>

        <FormField label="Business stage" htmlFor={stageId} hint="Growth stage">
          <Input
            id={stageId}
            value={draft.business.stage}
            onChange={(e) => update({ stage: e.target.value })}
            placeholder="e.g. Launching, Growing, Established"
            className="h-11"
          />
        </FormField>
      </div>

      <p className="text-[11.5px] text-sx-text-subtle">
        Website / location will be completed in Workspace Settings — not saved by this step.
      </p>
    </div>
  );
}
