"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { AccountInfo } from "./StepAccount";
import type { OnboardingDraft } from "../types";

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
  const businessName = draft.business.name || "My Business";
  const website = draft.business.website?.trim();
  const gbp = draft.business.googleMapsUrl?.trim();
  const location = draft.business.location?.trim() || "Not specified";
  const industry = draft.business.industry?.trim() || "General Business";
  const model = draft.business.businessModel || "B2B";

  // Separate verified connections (OAuth / OTP verified) from public-profile-only channels
  const verifiedChannels = (draft.account?.connections || []).filter(
    (c) => c.status === "connected" && (c.connectionType === "oauth" || c.connectionType === "otp_verified")
  );
  const publicChannels = (draft.account?.connections || []).filter(
    (c) => c.status === "connected" && c.connectionType === "public_profile"
  );

  const goals = draft.goals.length > 0
    ? draft.goals.map((g) => g.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()))
    : ["Improve Google Visibility", "Capture WhatsApp Leads", "Stay Active on Social Media"];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Everything looks good?</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          Review your verified details below. We&rsquo;ll use this snapshot to start your free business audit.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-4">
        {/* 1. Account & Connected Channels */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-sx-border/60 pb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              Account & Channels
            </span>
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <span>✓</span> Authenticated
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-sx-text-subtle block">StratXcel Account</span>
              <span className="font-medium text-sx-text">{account.displayName} ({account.email})</span>
            </div>
            <div className="space-y-2">
              <span className="text-sx-text-subtle block">Connected Channels</span>
              {verifiedChannels.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {verifiedChannels.map((c) => (
                    <span
                      key={c.platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sx-sm bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400"
                    >
                      <PlatformIcon name={c.platform} className="h-3 w-3" />
                      <span>✓ {c.handle || c.displayName || c.platform}</span>
                      {c.providerLabel && <span className="text-emerald-400/60">via {c.providerLabel}</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sx-text-muted italic">None connected via OAuth / OTP (can connect later)</span>
              )}
              {publicChannels.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {publicChannels.map((c) => (
                    <span
                      key={c.platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sx-sm bg-amber-500/5 border border-amber-500/20 text-[11px] font-medium text-amber-400"
                    >
                      <PlatformIcon name={c.platform} className="h-3 w-3" />
                      <span>○ {c.handle || c.displayName || c.platform}</span>
                      <span className="text-amber-400/60">public profile</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Business Profile */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-sx-border/60 pb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">
              Business Identity
            </span>
            <span className="font-bold text-xs text-sx-text">{businessName}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-sx-text-subtle block">Website</span>
              <span className="font-mono text-sx-text font-medium break-all">
                {website || "Not connected"}
              </span>
            </div>
            <div>
              <span className="text-sx-text-subtle block">Google Maps / Business Profile</span>
              <span className="font-medium text-sx-text">
                {gbp ? "✓ Profile connected" : "Not connected"}
              </span>
            </div>
            <div>
              <span className="text-sx-text-subtle block">Operating Location</span>
              <span className="font-medium text-sx-text">{location}</span>
            </div>
            <div>
              <span className="text-sx-text-subtle block">Industry & Model</span>
              <span className="font-medium text-sx-text">{industry} ({model})</span>
            </div>
          </div>
        </div>

        {/* 3. Focus Goals */}
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-2/60 p-4 space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle block">
            Focus Priorities
          </span>
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => (
              <span
                key={g}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sx-accent/15 border border-sx-accent/30 text-xs font-semibold text-sx-accent"
              >
                <span>✓</span> {g}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col items-center gap-3 pt-3">
        <Button
          type="button"
          variant="primary"
          size="touch"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full sm:w-auto min-h-12 px-8 text-sm font-bold shadow-md"
        >
          {submitting ? "Starting Your Free Audit…" : "GET MY FREE AUDIT →"}
        </Button>
        <p className="text-center text-xs text-sx-text-muted">
          Your information will be used to research your business and prepare your free audit.
        </p>
      </div>
    </div>
  );
}
