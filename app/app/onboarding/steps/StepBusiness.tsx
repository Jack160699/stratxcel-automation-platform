"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { slugify, type OnboardingDraft, type DiscoveredSocialDraft } from "../types";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { DiscoveredSocialLink } from "@/lib/identity/smart-url";

type DiscoveryStatus = "idle" | "validating" | "fetching" | "discovering" | "complete" | "partial" | "failed" | "timeout";

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
  const [discoveredSocials, setDiscoveredSocials] = useState<DiscoveredSocialLink[]>([]);
  const [confirmedSocials, setConfirmedSocials] = useState<Set<string>>(new Set());
  const [rejectedSocials, setRejectedSocials] = useState<Set<string>>(new Set());

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

  function toggleSocialConfirmation(url: string, confirm: boolean) {
    if (confirm) {
      setConfirmedSocials((prev) => new Set([...prev, url]));
      setRejectedSocials((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
      const currentSocials = (draft.business.socials ?? []).map((s) => (s.url === url ? { ...s, confirmed: true } : s));
      update({ socials: currentSocials });
    } else {
      setRejectedSocials((prev) => new Set([...prev, url]));
      setConfirmedSocials((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
      const currentSocials = (draft.business.socials ?? []).map((s) => (s.url === url ? { ...s, confirmed: false } : s));
      update({ socials: currentSocials });
    }
  }

  const isScanning = discoveryState === "validating" || discoveryState === "fetching" || discoveryState === "discovering";

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Website Primary Discovery Anchor */}
      <div className="rounded-sx-md bg-sx-surface-2 p-4 border border-sx-border/60">
        <FormField
          label="Connect your business (Website or Domain)"
          htmlFor={websiteId}
          hint="Enter your domain or website. We'll automatically discover your business profile and public channels."
        >
          <div className="flex gap-2">
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
              className="h-11 flex-1"
              autoFocus
            />
            <Button
              variant="primary"
              onClick={() => handleWebsiteDiscovery(draft.business.website)}
              disabled={isScanning || !draft.business.website.trim()}
            >
              {isScanning ? "Scanning…" : "Scan & Auto-Fill"}
            </Button>
          </div>
        </FormField>

        {/* Discovery Progress Indicator */}
        {discoveryState !== "idle" && (
          <div className="mt-3 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isScanning && <span className="inline-block h-2 w-2 rounded-full bg-sx-accent animate-pulse" />}
              {discoveryState === "complete" && <span className="text-sx-success">✓</span>}
              {discoveryState === "partial" && <span className="text-sx-warning">●</span>}
              {(discoveryState === "failed" || discoveryState === "timeout") && <span className="text-sx-danger">✕</span>}
              <span className="text-sx-text-muted">{discoveryMessage}</span>
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
          <div className="mt-4 pt-3 border-t border-sx-border/40 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sx-text">Discovered Social Channels</span>
              <span className="text-[11px] text-sx-text-subtle">Is this yours?</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {discoveredSocials.map((social) => {
                const isConfirmed = confirmedSocials.has(social.url);
                const isRejected = rejectedSocials.has(social.url);
                return (
                  <div
                    key={social.url}
                    className={`flex items-center justify-between p-2.5 rounded-sx-sm border text-xs ${
                      isConfirmed ? "bg-sx-surface-1 border-sx-success/40" : isRejected ? "bg-sx-surface-1/40 border-sx-border opacity-50" : "bg-sx-surface-1 border-sx-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <PlatformIcon name={social.platform === "x" ? "threads" : (social.platform as any)} />
                      <div className="truncate">
                        <p className="font-semibold truncate text-sx-text">{social.handle}</p>
                        <p className="text-[10px] text-sx-text-subtle truncate">{social.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleSocialConfirmation(social.url, true)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          isConfirmed ? "bg-sx-success text-white" : "bg-sx-surface-2 text-sx-text-muted hover:text-sx-text"
                        }`}
                      >
                        ✓ Mine
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSocialConfirmation(social.url, false)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          isRejected ? "bg-sx-danger text-white" : "bg-sx-surface-2 text-sx-text-muted hover:text-sx-text"
                        }`}
                      >
                        Not mine
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Discovered/Confirmed Business Identity Fields */}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Industry / category" htmlFor={industryId} optional>
          <Input
            id={industryId}
            value={draft.business.industry}
            onChange={(e) => update({ industry: e.target.value })}
            placeholder="e.g. Retail, SaaS, Hospitality, Consulting"
            className="h-11"
          />
        </FormField>

        <FormField label="Business model" htmlFor={modelId} optional>
          <Input
            id={modelId}
            value={draft.business.businessModel ?? ""}
            onChange={(e) => update({ businessModel: e.target.value })}
            placeholder="e.g. B2B Client Services, D2C Retail"
            className="h-11"
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Primary operating location" htmlFor={locationId} optional hint="Saved to your Business Profile (editable in Workspace Settings & Brand Brain).">
          <Input
            id={locationId}
            value={draft.business.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="e.g. Bhilai, Chhattisgarh, India"
            className="h-11"
          />
        </FormField>

        <FormField label="Business stage" htmlFor={stageId} optional hint="Determines your Audit Report vs Business Launch Plan.">
          <select
            id={stageId}
            value={draft.business.stage ?? "NEW/STARTING"}
            onChange={(e) => update({ stage: e.target.value })}
            className="h-11 w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 text-sm text-sx-text focus:outline-none focus:ring-1 focus:ring-sx-accent"
          >
            <option value="IDEA">Idea Stage (Pre-website)</option>
            <option value="PRE-LAUNCH">Pre-Launch</option>
            <option value="NEW/STARTING">New / Starting Business</option>
            <option value="EARLY BUSINESS">Early Business</option>
            <option value="GROWING">Growing SMB</option>
            <option value="ESTABLISHED">Established Business</option>
            <option value="MATURE">Mature Enterprise</option>
          </select>
        </FormField>
      </div>
    </div>
  );
}

