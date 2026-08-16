"use client";

import { SERVICE_CATALOGUE } from "@stratxcel/missions";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { PLAN_TIERS, type OnboardingDraft } from "../types";
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
  const planTier = PLAN_TIERS.find((t) => t.key === draft.plan.tier);
  const offers = draft.brand.offers.split("\n").map((l) => l.trim()).filter(Boolean);
  const restrictions = draft.brand.restrictions.split("\n").map((l) => l.trim()).filter(Boolean);
  const confirmedSocials = (draft.business.socials ?? []).filter((s) => s.confirmed !== false);

  return (
    <div className="flex flex-col gap-5 w-full">
      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        Review everything below, then create your workspace. This is the only step that writes anything permanent.
      </p>

      {error && <ErrorState message={error} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Account Card */}
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

        {/* Business Card */}
        <Card variant="nested">
          <CardHeading>Business Profile — saved now</CardHeading>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Business name</span>
            <span className="text-sx-text font-semibold">{draft.business.name || "—"}</span>
          </CardRow>
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Workspace slug</span>
            <span className="font-sx-mono text-sx-text text-xs bg-sx-surface-2 px-1.5 py-0.5 rounded">{draft.business.slug || "—"}</span>
          </CardRow>
          {draft.business.industry && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Industry</span>
              <span className="text-sx-text font-medium">{draft.business.industry}</span>
            </CardRow>
          )}
          {draft.business.businessModel && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Model</span>
              <span className="text-sx-text">{draft.business.businessModel}</span>
            </CardRow>
          )}
          {(draft.business.website || draft.business.location || draft.business.googleMapsUrl) && (
            <div className="border-t border-sx-border pt-2.5 text-[11.5px] text-sx-text-subtle">
              Website / location will be completed in Workspace Settings — not saved by this step.
            </div>
          )}
        </Card>

        {/* Digital Presence Card */}
        <Card variant="nested">
          <CardHeading>Connected Presence</CardHeading>
          {draft.business.website && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Website</span>
              <span className="font-mono text-xs text-sx-text truncate max-w-[200px]">{draft.business.website}</span>
            </CardRow>
          )}
          {draft.business.googleMapsUrl && (
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Google Maps</span>
              <span className="text-xs text-sx-success font-medium flex items-center gap-1">
                <span>✓</span> Profile Linked
              </span>
            </CardRow>
          )}
          {confirmedSocials.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-sx-border/40">
              {confirmedSocials.map((s) => (
                <div key={s.url + s.platform} className="flex items-center gap-1.5 px-2 py-1 rounded bg-sx-surface-2 border border-sx-border text-xs">
                  <PlatformIcon name={s.platform === "x" ? "threads" : (s.platform as any)} className="h-3.5 w-3.5" />
                  <span className="font-medium text-sx-text">{s.handle}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-2 text-[12px] text-sx-text-subtle">No social profiles connected.</p>
          )}
        </Card>

        {/* Goals Card */}
        <Card variant="nested">
          <CardHeading>Goals — recorded as a request</CardHeading>
          {goalLabels.length ? (
            <div className="flex flex-col gap-1.5 pt-1.5">
              {goalLabels.map((label) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-sx-text">
                  <span className="text-sx-accent font-bold">✓</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-2 text-[12.5px] text-sx-text-subtle">None selected.</p>
          )}
        </Card>

        {/* Brand Card */}
        <Card variant="nested" className="sm:col-span-2">
          <CardHeading>Brand Profile — saved to Brand Brain</CardHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            <CardRow className="justify-between">
              <span className="text-sx-text-muted">Brand name</span>
              <span className="text-sx-text font-medium">{draft.brand.businessName || draft.business.name || "—"}</span>
            </CardRow>
            {draft.brand.tone && (
              <CardRow className="justify-between">
                <span className="text-sx-text-muted">Tone</span>
                <span className="text-sx-text">{draft.brand.tone}</span>
              </CardRow>
            )}
            {draft.brand.audience && (
              <CardRow className="justify-between sm:col-span-2">
                <span className="text-sx-text-muted shrink-0">Audience</span>
                <span className="text-right text-sx-text text-xs">{draft.brand.audience}</span>
              </CardRow>
            )}
            {offers.length > 0 && (
              <CardRow className="justify-between sm:col-span-2">
                <span className="text-sx-text-muted shrink-0">Offers</span>
                <span className="text-right text-sx-text text-xs">{offers.join(", ")}</span>
              </CardRow>
            )}
            {restrictions.length > 0 && (
              <CardRow className="justify-between sm:col-span-2">
                <span className="text-sx-text-muted shrink-0">Restrictions</span>
                <span className="text-right text-sx-text text-xs">{restrictions.join(", ")}</span>
              </CardRow>
            )}
          </div>
          {draft.brand.description && (
            <div className="border-t border-sx-border pt-2.5 text-[11.5px] text-sx-text-subtle">
              Short description will be completed in Workspace Settings — not saved by this step.
            </div>
          )}
        </Card>

        {/* Plan Card */}
        <Card variant="nested" className="sm:col-span-2">
          <CardHeading>Plan — non-binding request</CardHeading>
          <p className="pt-2 text-[12.5px] text-sx-text font-medium">
            {planTier ? planTier.name : "Instant Audit (Free)"}
            {draft.plan.note && <span className="block font-normal text-sx-text-muted mt-0.5">{draft.plan.note}</span>}
          </p>
          <div className="border-t border-sx-border pt-2.5 text-[11.5px] text-sx-text-subtle">
            No plan is activated and no card is charged during onboarding.
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end pt-3">
        <Button
          type="button"
          variant="primary"
          size="touch"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full sm:w-auto px-8 font-semibold"
        >
          {submitting ? "Creating Workspace…" : "Create Workspace"}
        </Button>
      </div>
    </div>
  );
}
