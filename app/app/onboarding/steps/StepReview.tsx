"use client";

import { ErrorState } from "@/components/ui/Feedback";
import type { OnboardingDraft, V1SocialPlatformKey } from "../types";

/**
 * StratXcel Onboarding reference step 4 (Review & Launch) — a summary the
 * user can verify before the real launch happens. The Launch button
 * itself lives in the wizard's shared footer (matching the reference's
 * footerLaunch pattern), not in this component; this step only surfaces
 * the real submit error when one occurs.
 */
export function StepReview({
  draft,
  error,
  onEditDetails,
  onOpenConnector,
}: {
  draft: OnboardingDraft;
  error: string | null;
  onEditDetails: () => void;
  onOpenConnector: () => void;
}) {
  const businessName = draft.business.name || "My Business";
  const industry = draft.business.industry?.trim() || "General Business";
  const location = draft.business.location?.trim() || "Not specified";
  const goalLabels = draft.goals.length > 0 ? draft.goals.map((g) => g.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())).join(", ") : "Not specified";

  const connectionFor = (key: V1SocialPlatformKey) =>
    (draft.account?.connections || []).find(
      (c) => c.platform === key && c.status === "connected" && (c.connectionType === "oauth" || c.connectionType === "otp_verified")
    );
  const googleConnected = Boolean(connectionFor("google_business"));
  const waConnected = Boolean(connectionFor("whatsapp"));

  return (
    <div className="flex w-full flex-col gap-1">
      <h2 className="font-sx-sans text-xl font-bold text-sx-text">Almost ready!</h2>
      <p className="mb-5 text-sm leading-relaxed text-sx-text-muted">Check your details before we run your free audit.</p>

      {error && <div className="mb-3"><ErrorState message={error} /></div>}

      <div className="flex flex-col gap-3">
        {/* Business summary */}
        <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Your Business</p>
          <div className="flex flex-col gap-2.5">
            <SummaryRow label="Name" value={businessName} />
            <SummaryRow label="Category" value={industry} />
            <SummaryRow label="Location" value={location} />
            <SummaryRow label="Goals" value={goalLabels} />
          </div>
          <div className="mt-3 flex justify-end border-t border-sx-border pt-2.5">
            <button type="button" onClick={onEditDetails} className="text-[13px] font-semibold text-sx-accent">
              Edit details
            </button>
          </div>
        </div>

        {/* Connected accounts */}
        <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Connected Accounts</p>
          <ConnStatusRow label="Google Business" connected={googleConnected} />
          <ConnStatusRow label="WhatsApp Number" connected={waConnected} last />
          <button
            type="button"
            onClick={onOpenConnector}
            className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-sx-sm border-[1.5px] border-sx-accent/25 text-[13px] font-semibold text-sx-accent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            Connect accounts
          </button>
        </div>

        {/* What happens next */}
        <div className="rounded-sx-lg border-[1.5px] border-sx-accent/15 bg-sx-accent-muted p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-accent">What happens when you launch</p>
          <div className="flex flex-col gap-1.5">
            {[
              "We create your StratXcel workspace and save your profile",
              "Your connected channels are linked and ready",
              "Your free business health audit begins immediately",
            ].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" />
                <p className="text-[13px] leading-relaxed text-sx-text-muted">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[13px] text-sx-text-subtle">{label}</span>
      <span className="text-right text-[14px] font-semibold text-sx-text">{value}</span>
    </div>
  );
}

function ConnStatusRow({ label, connected, last = false }: { label: string; connected: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-sx-border"}`}>
      <span className="text-[14px] text-sx-text">{label}</span>
      <span className={`text-xs font-semibold ${connected ? "text-sx-success" : "text-sx-text-subtle"}`}>
        {connected ? "Connected ✓" : "Not connected"}
      </span>
    </div>
  );
}
