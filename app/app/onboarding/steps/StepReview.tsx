"use client";

import { SERVICE_CATALOGUE } from "@stratxcel/missions";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { PLAN_TIERS, type OnboardingDraft } from "../types";
import type { AccountInfo } from "./StepAccount";

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

  return (
    <div className="flex flex-col gap-4">
      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        Review everything below, then create your workspace. This is the only step that writes anything permanent.
      </p>

      <Card variant="nested">
        <CardHeading>Account</CardHeading>
        <CardRow className="justify-between">
          <span className="text-sx-text-muted">Name</span>
          <span className="text-sx-text">{account.displayName || "—"}</span>
        </CardRow>
        <CardRow className="justify-between">
          <span className="text-sx-text-muted">Email</span>
          <span className="text-sx-text">{account.email ?? "—"}</span>
        </CardRow>
      </Card>

      <Card variant="nested">
        <CardHeading>Business — saved now</CardHeading>
        <CardRow className="justify-between">
          <span className="text-sx-text-muted">Name</span>
          <span className="text-sx-text">{draft.business.name || "—"}</span>
        </CardRow>
        <CardRow className="justify-between">
          <span className="text-sx-text-muted">Slug</span>
          <span className="font-sx-mono text-sx-text">{draft.business.slug || "—"}</span>
        </CardRow>
        {draft.business.industry && (
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Industry</span>
            <span className="text-sx-text">{draft.business.industry}</span>
          </CardRow>
        )}
        {(draft.business.website || draft.business.location) && (
          <div className="border-t border-sx-border pt-2.5 text-[11.5px] text-sx-text-subtle">
            Website / location will be completed in Workspace Settings — not saved by this step.
          </div>
        )}
      </Card>

      <Card variant="nested">
        <CardHeading>Goals — recorded as a request</CardHeading>
        {goalLabels.length ? (
          <p className="pt-2 text-[12.5px] text-sx-text">{goalLabels.join(", ")}</p>
        ) : (
          <p className="pt-2 text-[12.5px] text-sx-text-subtle">None selected.</p>
        )}
      </Card>

      <Card variant="nested">
        <CardHeading>Brand — saved to Brand Brain</CardHeading>
        <CardRow className="justify-between">
          <span className="text-sx-text-muted">Brand name</span>
          <span className="text-sx-text">{draft.brand.businessName || draft.business.name || "—"}</span>
        </CardRow>
        {draft.brand.audience && (
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Audience</span>
            <span className="text-sx-text">{draft.brand.audience}</span>
          </CardRow>
        )}
        {draft.brand.tone && (
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Tone</span>
            <span className="text-sx-text">{draft.brand.tone}</span>
          </CardRow>
        )}
        {offers.length > 0 && (
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Offers</span>
            <span className="text-right text-sx-text">{offers.join(", ")}</span>
          </CardRow>
        )}
        {restrictions.length > 0 && (
          <CardRow className="justify-between">
            <span className="text-sx-text-muted">Restrictions</span>
            <span className="text-right text-sx-text">{restrictions.join(", ")}</span>
          </CardRow>
        )}
        {draft.brand.description && (
          <div className="border-t border-sx-border pt-2.5 text-[11.5px] text-sx-text-subtle">
            Short description will be completed in Workspace Settings — not saved by this step.
          </div>
        )}
      </Card>

      <Card variant="nested">
        <CardHeading>Plan — non-binding request</CardHeading>
        <p className="pt-2 text-[12.5px] text-sx-text">
          {planTier ? planTier.name : "No preference selected"}
          {draft.plan.note && <span className="block text-sx-text-muted">{draft.plan.note}</span>}
        </p>
        <p className="pt-2 text-[11.5px] text-sx-text-subtle">No plan is activated and nothing is billed by this step.</p>
      </Card>

      {error && <ErrorState message={error} />}

      <Button type="button" variant="primary" size="touch" onClick={onSubmit} disabled={submitting} aria-busy={submitting} className="w-full">
        {submitting ? "Creating your workspace…" : "Create workspace"}
      </Button>
    </div>
  );
}
