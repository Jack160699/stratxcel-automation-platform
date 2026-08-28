"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PublishingMode = "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";

type ToggleState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not_activated" }
  | { status: "ready"; authorizationId: string; publishingMode: PublishingMode };

/**
 * Retroactive Tenant Backfill & Settings/Profile Autopilot Toggle mission:
 * publishing_mode (Social Autopilot's Auto-publish vs Review-before-
 * publish) was write-once at activation with no way to change it anywhere
 * in the product afterward -- the /app/content/autopilot dashboard only
 * ever showed it as read-only text. This is the one real control, shared
 * between Settings and the profile menu so both stay in sync with the
 * same authorization instead of drifting.
 *
 * Renders nothing while loading/erroring, and a real (non-fake) "not set
 * up yet" prompt rather than a switch with nothing behind it when
 * Autopilot has never been activated for this tenant -- consistent with
 * this app's "only real, functioning controls render" convention (see
 * SettingsPage's own header comment).
 */
export function AutopilotModeToggle({ tenantId, variant }: { tenantId: string | null; variant: "settings" | "profile" }) {
  const [state, setState] = useState<ToggleState>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!tenantId) return;
    fetch(`/api/platform/social/autopilot?tenantId=${encodeURIComponent(tenantId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load Autopilot"))))
      .then((result: { activated: boolean; authorizationId?: string; publishingMode?: PublishingMode }) => {
        if (!result.activated || !result.authorizationId || !result.publishingMode) {
          setState({ status: "not_activated" });
          return;
        }
        setState({ status: "ready", authorizationId: result.authorizationId, publishingMode: result.publishingMode });
      })
      .catch(() => setState({ status: "error" }));
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setMode(mode: PublishingMode) {
    if (state.status !== "ready" || state.publishingMode === mode || saving) return;
    const previous = state;
    setSaving(true);
    setState({ ...state, publishingMode: mode });
    try {
      const response = await fetch("/api/platform/social/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action: "updatePublishingMode", authorizationId: state.authorizationId, publishingMode: mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Request failed");
    } catch {
      setState(previous);
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId || state.status === "loading" || state.status === "error") return null;

  const heading = "Social Autopilot";
  const description = state.status === "not_activated"
    ? "Not set up yet — activate it to auto-generate and post your content."
    : "Choose whether new posts publish automatically or wait for your review.";

  if (variant === "settings") {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Automation</p>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-sx-text">{heading}</p>
            <p className="mt-0.5 text-[13px] text-sx-text-muted">{description}</p>
          </div>
          {state.status === "not_activated" ? (
            <Link href="/app/content/autopilot" className="shrink-0 rounded-sx-sm border border-sx-border-strong px-3 py-2 text-[13px] font-semibold text-sx-accent hover:bg-sx-surface-2">
              Set up
            </Link>
          ) : (
            <ModeSegmentedControl mode={state.publishingMode} saving={saving} onChange={setMode} />
          )}
        </div>
      </div>
    );
  }

  // variant === "profile": compact block styled to match the Appearance
  // section already in this same modal (uppercase-tracking label, tight
  // spacing, two-column grid of options).
  return (
    <div className="pt-1">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">{heading}</p>
      {state.status === "not_activated" ? (
        <Link
          href="/app/content/autopilot"
          className="flex min-h-[40px] items-center justify-between rounded-sx-sm border border-sx-border px-3 text-[13px] font-semibold text-sx-accent hover:bg-sx-surface-2"
        >
          <span>Set up Autopilot</span>
          <span aria-hidden="true">›</span>
        </Link>
      ) : (
        <ModeSegmentedControl mode={state.publishingMode} saving={saving} onChange={setMode} compact />
      )}
    </div>
  );
}

function ModeSegmentedControl({
  mode,
  saving,
  onChange,
  compact = false,
}: {
  mode: PublishingMode;
  saving: boolean;
  onChange: (mode: PublishingMode) => void;
  compact?: boolean;
}) {
  const options: Array<{ value: PublishingMode; label: string }> = [
    { value: "AUTO_PUBLISH", label: "Auto-publish" },
    { value: "REVIEW_BEFORE_PUBLISH", label: "Review first" },
  ];
  return (
    <div
      role="group"
      aria-label="Social Autopilot publishing mode"
      className={compact ? "grid grid-cols-2 gap-2" : "flex shrink-0 rounded-sx-sm bg-sx-surface-2 p-[3px]"}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          disabled={saving}
          onClick={() => onChange(option.value)}
          className={
            compact
              ? `min-h-[40px] rounded-sx-sm border text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                  mode === option.value
                    ? "border-sx-accent bg-sx-accent/10 text-sx-accent"
                    : "border-sx-border text-sx-text-muted hover:bg-sx-surface-2"
                }`
              : `h-[34px] rounded-sx-xs px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                  mode === option.value ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted"
                }`
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
