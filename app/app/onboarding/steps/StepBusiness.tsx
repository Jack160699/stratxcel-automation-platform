"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { slugify, type OnboardingDraft, type DiscoveredSocialDraft } from "../types";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { DiscoveredSocialLink } from "@/lib/identity/smart-url";

type DiscoveryStatus = "idle" | "validating" | "fetching" | "discovering" | "complete" | "partial" | "failed" | "timeout";

import { validateAndNormalizeSocialInput } from "@/lib/identity/social-normalizer";

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

  async function handleWebsiteDiscovery(urlToScan: string) {
    if (!urlToScan.trim()) return;
    setDiscoveryState("validating");
    setDiscoveryMessage("Validating domain and security checks...");

    try {
      setDiscoveryState("fetching");
      setDiscoveryMessage(`Connecting to ${urlToScan.trim()}...`);

      const res = await fetch("/api/platform/site-discovery/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: urlToScan }),
      });

      const body = await res.json();

      if (body.finalState === "FAILED" || body.finalState === "TIMEOUT") {
        setDiscoveryState(body.finalState === "TIMEOUT" ? "timeout" : "failed");
        setDiscoveryMessage(body.error ?? "Website could not be fully analyzed.");
        return;
      }

      setDiscoveryState(body.finalState === "COMPLETE" ? "complete" : "partial");
      setDiscoveryMessage(
        body.finalState === "COMPLETE"
          ? "✓ We found your business details and public channels!"
          : "Partial website information discovered."
      );

      // Auto-populate discovered business fields
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
      if (body.data?.businessStage) {
        updates.stage = body.data.businessStage;
      }
      if (body.data?.services && Array.isArray(body.data.services)) {
        updates.services = body.data.services;
      }
      if (body.data?.primaryOffer) {
        updates.primaryOffer = body.data.primaryOffer;
      }
      if (body.data?.phone || body.data?.whatsapp) {
        updates.whatsapp = body.data.whatsapp || body.data.phone;
      }
      if (body.data?.socialLinks && Array.isArray(body.data.socialLinks)) {
        setDiscoveredSocials(body.data.socialLinks);
        const confirmedSet = new Set<string>(body.data.socialLinks.map((s: DiscoveredSocialLink) => s.url));
        setConfirmedSocials(confirmedSet);
        updates.socials = body.data.socialLinks.map((s: DiscoveredSocialLink) => ({
          platform: s.platform,
          url: s.url,
          handle: s.handle,
          confirmed: true,
        }));
      }

      update(updates);
    } catch {
      setDiscoveryState("failed");
      setDiscoveryMessage("Website analysis failed. You can continue filling details manually.");
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
    // Open replacement inline panel directly for this platform
    setReplacingPlatform(social.platform);
    setReplacementErrors((prev) => ({ ...prev, [social.platform]: "" }));
    const currentSocials = (draft.business.socials ?? []).map((s) => (s.url === social.url ? { ...s, confirmed: false } : s));
    update({ socials: currentSocials });
  }

  function handleCancelReplacement(platform: string) {
    setReplacingPlatform(null);
    setReplacementErrors((prev) => ({ ...prev, [platform]: "" }));
  }

  function handleSubmitReplacement(social: DiscoveredSocialLink) {
    const rawVal = replacementInputs[social.platform] ?? "";
    const result = validateAndNormalizeSocialInput(social.platform, rawVal);

    if (!result.success) {
      setReplacementErrors((prev) => ({ ...prev, [social.platform]: result.error }));
      return;
    }

    const normalized = result.data;
    const oldUrl = social.url;

    // Update discovered socials array with the new correct account
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

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Website Primary Discovery Anchor */}
      <div className="rounded-sx-md bg-sx-surface-2 p-5 sm:p-6 border border-sx-border/60 w-full shadow-xs">
        <FormField
          label="Connect your business (Website or Domain)"
          htmlFor={websiteId}
          hint="Enter your domain or website. We'll automatically discover your business profile and public channels."
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              id={websiteId}
              type="text"
              value={draft.business.website}
              onChange={(e) => update({ website: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleWebsiteDiscovery(draft.business.website);
                }
              }}
              placeholder="e.g. yourbusiness.com or https://mycompany.in"
              className="h-11 flex-1 min-w-0"
              autoFocus
            />
            <Button
              variant="primary"
              onClick={() => handleWebsiteDiscovery(draft.business.website)}
              disabled={isScanning || !draft.business.website.trim()}
              className="h-11 px-6 shrink-0 font-medium"
            >
              {isScanning ? "Scanning…" : "Scan & Auto-Fill"}
            </Button>
          </div>
        </FormField>

        {/* Discovery Progress Indicator */}
        {discoveryState !== "idle" && (
          <div className="mt-3.5 text-xs flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {isScanning && <span className="inline-block h-2.5 w-2.5 rounded-full bg-sx-accent animate-pulse" />}
              {discoveryState === "complete" && <span className="text-sx-success font-bold">✓</span>}
              {discoveryState === "partial" && <span className="text-sx-warning font-bold">●</span>}
              {(discoveryState === "failed" || discoveryState === "timeout") && <span className="text-sx-danger font-bold">✕</span>}
              <span className="text-sx-text font-medium">{discoveryMessage}</span>
            </div>
            {(discoveryState === "failed" || discoveryState === "timeout") && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleWebsiteDiscovery(draft.business.website)}
                >
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDiscoveryState("idle")}
                >
                  Continue anyway
                </Button>
              </div>
            )}
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
                            <span className="text-xs font-medium text-sx-success">✓ Verified</span>
                            <button
                              type="button"
                              onClick={() => handleSelectNotMine(social)}
                              className="text-xs text-sx-text-muted hover:text-sx-text underline hover:no-underline px-2 py-1"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectMine(social)}
                              className="flex-1 min-h-8.5 px-3 py-1.5 rounded-sx-sm text-xs font-semibold bg-sx-surface-2 text-sx-text hover:bg-sx-success hover:text-white border border-sx-border transition-colors text-center"
                            >
                              ✓ Mine
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectNotMine(social)}
                              className="flex-1 min-h-8.5 px-3 py-1.5 rounded-sx-sm text-xs font-semibold bg-sx-surface-2 text-sx-text-muted hover:bg-sx-danger hover:text-white border border-sx-border transition-colors text-center"
                            >
                              Not mine
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inline Replacement Workflow Panel */}
                    {isReplacing && (
                      <div className="mt-2 pt-3 border-t border-sx-border flex flex-col gap-2.5 bg-sx-surface-2 p-3 rounded-sx-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-sx-text">Enter your real {platformLabel} account:</p>
                          <button
                            type="button"
                            onClick={() => handleCancelReplacement(social.platform)}
                            className="text-[11px] text-sx-text-subtle hover:text-sx-text"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                        <div>
                          <Input
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
                                : social.platform === "threads"
                                ? "@yourbrand or threads.net/@yourbrand"
                                : social.platform === "linkedin"
                                ? "company-name or linkedin.com/company/..."
                                : social.platform === "whatsapp"
                                ? "+91 98765 43210"
                                : "https://..."
                            }
                            className="h-9 text-xs"
                            autoFocus
                          />
                          {replacementErrors[social.platform] && (
                            <p className="mt-1 text-[11.5px] text-sx-danger font-medium">{replacementErrors[social.platform]}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelReplacement(social.platform)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleSubmitReplacement(social)}
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

      {/* 2. Discovered/Confirmed Business Identity Fields */}
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      {/* 3. Operational Metadata Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <FormField label="Industry / category" htmlFor={industryId} hint="Optional">
          <Input
            id={industryId}
            value={draft.business.industry}
            onChange={(e) => update({ industry: e.target.value })}
            placeholder="e.g. Retail, HVAC, Cafe"
            className="h-11"
          />
        </FormField>

        <FormField label="Business model" htmlFor={modelId} hint="Optional">
          <Input
            id={modelId}
            value={draft.business.businessModel}
            onChange={(e) => update({ businessModel: e.target.value })}
            placeholder="e.g. Local Store, Service, D2C"
            className="h-11"
          />
        </FormField>

        <FormField label="Primary location" htmlFor={locationId} hint="Optional">
          <Input
            id={locationId}
            value={draft.business.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="e.g. Bhilai, Chhattisgarh, IN"
            className="h-11"
          />
        </FormField>

        <FormField label="Business stage" htmlFor={stageId} hint="Optional">
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
