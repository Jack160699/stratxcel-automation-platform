"use client";

import { SERVICE_CATALOGUE } from "@stratxcel/missions";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import type { OnboardingDraft } from "../types";
import type { AccountInfo } from "./StepAccount";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

export function StepReview({
  account,
  draft,
  submitting,
  error,
  onSubmit,
}: {
  account: AccountInfo;
  draft: OnboardingDraft;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const goalLabels = draft.goals.map((key) => SERVICE_CATALOGUE.find((e) => e.key === key)?.label ?? key);
  const offers = draft.brand.offers.split("\n").map((l) => l.trim()).filter(Boolean);
  const restrictions = draft.brand.restrictions.split("\n").map((l) => l.trim()).filter(Boolean);
  const confirmedSocials = (draft.business.socials ?? []).filter((s) => s.confirmed !== false);

  const hasWebsite = Boolean(draft.business.website?.trim());
  const hasGoogleMaps = Boolean(draft.business.googleMapsUrl?.trim());
  const hasSocials = confirmedSocials.length > 0;
  const hasLocation = Boolean(draft.business.location?.trim());

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="rounded-sx-md bg-sx-surface-2/70 p-4 border border-sx-border/80">
        <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text">
          We&rsquo;ve combined your website, Google presence, social profiles, business details, and goals. Review them once, then we&rsquo;ll run your audit.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* 1. Account Section */}
        <Card variant="nested">
          <CardHeading>Account</CardHeading>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Name</span>
            <span className="text-sx-text font-medium">{account.displayName || "—"}</span>
          </CardRow>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Email</span>
            <span className="text-sx-text font-medium">{account.email ?? "—"}</span>
          </CardRow>
        </Card>

        {/* 2. Business Profile Section */}
        <Card variant="nested">
          <CardHeading>Business Profile</CardHeading>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Business name</span>
            <span className="text-sx-text font-semibold">{draft.business.name || "—"}</span>
          </CardRow>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Workspace slug</span>
            <span className="font-sx-mono text-sx-text text-xs bg-sx-surface-2 px-2 py-0.5 rounded border border-sx-border/60">
              {draft.business.slug || "—"}
            </span>
          </CardRow>
          {draft.business.industry && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Industry</span>
              <span className="text-sx-text font-medium">{draft.business.industry}</span>
            </CardRow>
          )}
          {draft.business.businessModel && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Operating model</span>
              <span className="text-sx-text">{draft.business.businessModel}</span>
            </CardRow>
          )}
          {hasLocation && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Location</span>
              <span className="text-sx-text">{draft.business.location}</span>
            </CardRow>
          )}
        </Card>

        {/* 3. Connected Presence Section (All Real Verified Sources) */}
        <Card variant="nested" className="sm:col-span-2">
          <CardHeading>Connected Public Presence</CardHeading>
          
          <div className="grid gap-3.5 sm:grid-cols-2 pt-1">
            {/* Website Source */}
            {hasWebsite && (
              <div className="flex flex-col justify-between gap-1.5 p-3 rounded-sx-sm bg-sx-surface-2/60 border border-sx-border/80">
                <div className="flex items-center gap-2">
                  <PlatformIcon name="website" className="h-4 w-4 text-sx-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-sx-text">Official Website</span>
                </div>
                <p className="font-mono text-xs text-sx-text break-all mt-0.5">{draft.business.website}</p>
                <span className="text-[11px] text-sx-success font-medium flex items-center gap-1 mt-1">
                  ✓ Verified Domain
                </span>
              </div>
            )}

            {/* Google Maps / GBP Source */}
            {hasGoogleMaps && (
              <div className="flex flex-col justify-between gap-1.5 p-3 rounded-sx-sm bg-sx-surface-2/60 border border-sx-border/80">
                <div className="flex items-center gap-2">
                  <PlatformIcon name="google_business" className="h-4 w-4 text-sx-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-sx-text">Google Maps / Business Profile</span>
                </div>
                <p className="text-xs font-semibold text-sx-text mt-0.5">
                  {draft.business.name} {hasLocation ? `· ${draft.business.location}` : ""}
                </p>
                <p className="font-mono text-[11px] text-sx-text-subtle break-all line-clamp-1 hover:line-clamp-none">
                  {draft.business.googleMapsUrl}
                </p>
                <span className="text-[11px] text-sx-success font-medium flex items-center gap-1 mt-1">
                  ✓ Profile Linked
                </span>
              </div>
            )}

            {/* Confirmed Social Channels Grid */}
            {hasSocials && (
              <div className="sm:col-span-2 pt-2 border-t border-sx-border/40">
                <span className="text-xs font-semibold text-sx-text-subtle uppercase tracking-wider block mb-2">
                  Confirmed Social Profiles ({confirmedSocials.length})
                </span>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {confirmedSocials.map((s) => {
                    const platformKey = s.platform === "x" ? "threads" : (s.platform as any);
                    const platformLabel = s.platform.charAt(0).toUpperCase() + s.platform.slice(1);

                    return (
                      <div
                        key={s.url + s.platform}
                        className="flex items-center gap-2.5 p-2.5 rounded-sx-sm bg-sx-surface-2 border border-sx-border/70"
                      >
                        <div className="p-1.5 rounded bg-sx-surface-1 border border-sx-border shrink-0">
                          <PlatformIcon name={platformKey} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sx-text-subtle">{platformLabel}</span>
                            <span className="text-[10px] font-semibold text-sx-success">✓</span>
                          </div>
                          <p className="text-xs font-medium text-sx-text truncate" title={s.handle}>{s.handle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasWebsite && !hasGoogleMaps && !hasSocials && (
              <p className="sm:col-span-2 text-xs text-sx-text-subtle italic py-2">
                No public digital presence linked yet. You can still proceed to audit your business foundation.
              </p>
            )}

            {!hasSocials && (hasWebsite || hasGoogleMaps) && (
              <div className="sm:col-span-2 text-xs text-sx-text-muted pt-1">
                <span className="font-semibold text-sx-text-subtle">Social profiles: </span>
                <span>No social profiles were provided or confirmed.</span>
              </div>
            )}
          </div>
        </Card>

        {/* 4. Goals Section */}
        <Card variant="nested" className="sm:col-span-2">
          <CardHeading>Selected Goals</CardHeading>
          {goalLabels.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {goalLabels.map((label) => (
                <div key={label} className="flex items-center gap-2 p-2 rounded bg-sx-surface-2 border border-sx-border/50 text-xs text-sx-text font-medium">
                  <span className="text-sx-accent font-bold">✓</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-2 text-[12.5px] text-sx-text-subtle">None selected.</p>
          )}
        </Card>

        {/* 5. Brand Profile Section */}
        <Card variant="nested" className="sm:col-span-2">
          <CardHeading>Brand Profile & Signals</CardHeading>
          <div className="grid gap-3.5 sm:grid-cols-2 pt-1">
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Brand name</span>
              <span className="text-sx-text font-medium">{draft.brand.businessName || draft.business.name || "—"}</span>
            </CardRow>

            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Tone / personality</span>
              <span className="text-sx-text font-medium">{draft.brand.tone || "Professional, trustworthy, customer-focused"}</span>
            </CardRow>

            <CardRow className="justify-between sm:col-span-2">
              <span className="text-sx-text-muted shrink-0">Short description</span>
              <span className="text-right text-sx-text text-xs leading-relaxed max-w-[75%]">
                {draft.brand.description || "Not available yet — we'll refine this during the audit."}
              </span>
            </CardRow>

            <CardRow className="justify-between sm:col-span-2">
              <span className="text-sx-text-muted shrink-0">Target audience</span>
              <span className="text-right text-sx-text text-xs leading-relaxed max-w-[75%]">
                {draft.brand.audience || "Prospective customers and clients"}
              </span>
            </CardRow>

            {offers.length > 0 && (
              <CardRow className="justify-between sm:col-span-2">
                <span className="text-sx-text-muted shrink-0">Primary offers</span>
                <span className="text-right text-sx-text text-xs leading-relaxed max-w-[75%]">
                  {offers.join(" · ")}
                </span>
              </CardRow>
            )}

            {restrictions.length > 0 && (
              <CardRow className="justify-between sm:col-span-2">
                <span className="text-sx-text-muted shrink-0">Restrictions to avoid</span>
                <span className="text-right text-sx-text text-xs leading-relaxed max-w-[75%]">
                  {restrictions.join(" · ")}
                </span>
              </CardRow>
            )}
          </div>
        </Card>
      </div>

      {/* Action Button Row */}
      <div className="flex items-center justify-end pt-3">
        <Button
          type="button"
          variant="primary"
          size="touch"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full sm:w-auto px-8 font-bold text-sm h-12 shadow-sm"
        >
          {submitting ? "Creating Workspace & Starting Audit…" : "Create Workspace & Start Audit →"}
        </Button>
      </div>
    </div>
  );
}
