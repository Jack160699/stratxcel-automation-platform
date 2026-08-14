"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { slugify, type OnboardingDraft } from "../types";
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
          ? "✓ Business details and profiles discovered!"
          : "Partial website information discovered."
      );

      // Auto-populate discovered business fields if not already manually typed
      const updates: Partial<OnboardingDraft["business"]> = {};
      if (body.data?.websiteUrl) updates.website = body.data.websiteUrl;
      if (body.data?.businessName && (!draft.business.name || !draft.business.slugTouched)) {
        updates.name = body.data.businessName;
        updates.slug = slugify(body.data.businessName);
      }
      if (body.data?.location && !draft.business.location) {
        updates.location = body.data.location;
      }
      if (body.data?.socialLinks && Array.isArray(body.data.socialLinks)) {
        setDiscoveredSocials(body.data.socialLinks);
        // Default confirm all discovered
        setConfirmedSocials(new Set(body.data.socialLinks.map((s: DiscoveredSocialLink) => s.url)));
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
    } else {
      setRejectedSocials((prev) => new Set([...prev, url]));
      setConfirmedSocials((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  }

  const isScanning = discoveryState === "validating" || discoveryState === "fetching" || discoveryState === "discovering";

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Website Primary Discovery Anchor */}
      <div className="rounded-sx-md bg-sx-surface-2 p-4 border border-sx-border/60">
        <FormField
          label="Your Website (Primary Discovery Anchor)"
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
              placeholder="e.g. xyzconsultants.in or https://mybusiness.com"
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
            <span className="text-xs font-semibold text-sx-text">Discovered Social Channels</span>
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

      {/* 2. Confirmed Business Identity Fields */}
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

      <FormField label="Industry / category" htmlFor={industryId} optional>
        <Input
          id={industryId}
          value={draft.business.industry}
          onChange={(e) => update({ industry: e.target.value })}
          placeholder="e.g. Retail, SaaS, Hospitality, Consulting"
          className="h-11"
        />
      </FormField>

      <FormField label="Primary operating location" htmlFor={locationId} optional hint="Saved to your Business Profile (editable in Workspace Settings & Brand Brain).">
        <Input
          id={locationId}
          value={draft.business.location}
          onChange={(e) => update({ location: e.target.value })}
          placeholder="e.g. Bhilai, Chhattisgarh, India"
          className="h-11"
        />
      </FormField>
    </div>
  );
}
