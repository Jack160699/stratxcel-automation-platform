"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { PackagePublishPreviewCard } from "./PackagePublishPreview";
import type { PackagePublishPreview } from "@/lib/social/package-preview";
import { VisualStyleCard } from "./VisualStyleOnboarding";
import { ManualArchetypeGeneration } from "./ManualArchetypeGeneration";

interface UpcomingItem {
  id: string;
  sequence: number;
  scheduledAt: string;
  scheduledWall: string;
  status: string;
  contentPillar: string | null;
  /** The creative concept this post was built around (e.g. "dish spotlight") -- null for content prepared before the quality campaign. */
  concept: string | null;
  /** The real quality-gate score this post passed at (0-100), never fabricated -- null when not available. */
  qualityScore: number | null;
  blockedReason: string | null;
  platform: string | null;
  accountLabel: string | null;
  caption: string;
  hashtags: string[];
}
interface HistoryItem {
  id: string;
  sequence: number;
  status: string;
  platform: string | null;
  accountLabel: string | null;
  permalink: string | null;
  error: string | null;
}
interface Overview {
  activated: true;
  authorizationId: string;
  state: string;
  stateLabel: string;
  publishingMode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
  packageSize: number;
  published: number;
  remaining: number;
  periodStart: string;
  periodEnd: string | null;
  timezone: string;
  compositionLabel: string;
  destinations: string[];
  upcoming: UpcomingItem[];
  history: HistoryItem[];
}
interface NotActivated {
  activated: false;
  eligibility: {
    subscriptionActive: boolean;
    subscriptionId: string | null;
    entitlementId: string | null;
    entitlementAvailable: boolean;
    remainingUnits: number;
    connectedPlatforms: string[];
    brandConfigured: boolean;
    brandProfileId: string | null;
    packageConfigured: boolean;
    compositionLabel: string | null;
    compositionItems: Array<{ mediaType: string; quantity: number }> | null;
    assignment: {
      brand: { available: boolean; label: string | null; alreadyBound: boolean };
      accounts: Array<{ platform: string; platformLabel: string; label: string; available: boolean; alreadyBound: boolean }>;
    };
  };
}

const STATE_CHIP: Record<string, ChipState> = {
  Active: "success",
  Paused: "warning",
  "Needs attention": "danger",
  Cancelled: "neutral",
  Expired: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  PREPARED: "Ready",
  REVIEW_REQUIRED: "Ready for review",
  SCHEDULED: "Scheduled",
  BLOCKED: "Needs attention",
};

function formatDate(iso: string | null, timeZone?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) });
}

async function callAutopilotApi(body: Record<string, unknown>) {
  const response = await fetch("/api/platform/social/autopilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}

function ActivationChecklist({ tenantId, eligibility, onActivated }: { tenantId: string; eligibility: NotActivated["eligibility"]; onActivated: () => void }) {
  const [platforms, setPlatforms] = useState<string[]>(eligibility.connectedPlatforms);
  const [activating, setActivating] = useState(false);
  const [assigningBrand, setAssigningBrand] = useState(false);
  const [assigningPlatform, setAssigningPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready =
    eligibility.subscriptionActive &&
    eligibility.entitlementAvailable &&
    eligibility.brandConfigured &&
    eligibility.packageConfigured &&
    eligibility.connectedPlatforms.length > 0;

  const assignBrand = async () => {
    setAssigningBrand(true);
    setError(null);
    try {
      await callAutopilotApi({ tenantId, action: "assignBrand" });
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign Brand Brain.");
    } finally {
      setAssigningBrand(false);
    }
  };

  const assignAccount = async (platform: string) => {
    setAssigningPlatform(platform);
    setError(null);
    try {
      await callAutopilotApi({ tenantId, action: "assignAccount", platform });
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign social account.");
    } finally {
      setAssigningPlatform(null);
    }
  };

  const activate = async () => {
    setActivating(true);
    setError(null);
    try {
      await callAutopilotApi({
        tenantId,
        action: "activate",
        subscriptionId: eligibility.subscriptionId,
        entitlementId: eligibility.entitlementId,
        publishingMode: "AUTO_PUBLISH",
        allowedPlatforms: platforms,
        brandProfileId: eligibility.brandProfileId,
      });
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate Social Autopilot.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <Card variant="panel">
      <CardHeading>Autopilot needs setup</CardHeading>
      <div className="mt-3 space-y-2 text-[12.5px] text-sx-text-muted">
        <CardRow>{eligibility.subscriptionActive ? "✓" : "○"} Subscription active</CardRow>
        <CardRow>{eligibility.brandConfigured ? "✓" : "○"} Brand configured{eligibility.assignment.brand.alreadyBound && eligibility.assignment.brand.label ? ` (${eligibility.assignment.brand.label})` : ""}</CardRow>
        {!eligibility.brandConfigured && eligibility.assignment.brand.available && eligibility.assignment.brand.label && (
          <CardRow className="flex-wrap items-center gap-2">
            <span>Unassigned Brand Brain found: {eligibility.assignment.brand.label}</span>
            <Button size="sm" variant="primary" disabled={assigningBrand} onClick={() => void assignBrand()}>
              {assigningBrand ? "Assigning…" : "Assign to this workspace"}
            </Button>
          </CardRow>
        )}
        <CardRow>{eligibility.entitlementAvailable ? "✓" : "○"} Social posts entitlement available ({eligibility.remainingUnits} remaining)</CardRow>
        <CardRow>
          {eligibility.packageConfigured ? "✓" : "○"} Package composition
          {eligibility.compositionLabel ? ` · ${eligibility.compositionLabel}` : " · needs setup"}
        </CardRow>
        {!eligibility.packageConfigured && (
          <CardRow className="text-[#FF8A90]">Package configuration required — your purchased mix is not available for Autopilot yet.</CardRow>
        )}
        <CardRow>
          {eligibility.connectedPlatforms.length > 0 ? "✓" : "○"} Connected accounts
          {eligibility.connectedPlatforms.length > 0 && (
            <span className="ml-2 flex flex-wrap gap-1">
              {eligibility.connectedPlatforms.map((platform) => (
                <label key={platform} className="flex items-center gap-1 text-sx-text">
                  <input type="checkbox" checked={platforms.includes(platform)} onChange={(event) => setPlatforms((current) => (event.target.checked ? [...current, platform] : current.filter((p) => p !== platform)))} />
                  {platform}
                </label>
              ))}
            </span>
          )}
        </CardRow>
        {eligibility.assignment.accounts.filter((account) => account.available && !account.alreadyBound).map((account) => (
          <CardRow key={account.platform} className="flex-wrap items-center gap-2">
            <span>Connected but not assigned: {account.platformLabel}{account.label ? ` · ${account.label}` : ""}</span>
            <Button size="sm" variant="primary" disabled={assigningPlatform === account.platform} onClick={() => void assignAccount(account.platform)}>
              {assigningPlatform === account.platform ? "Assigning…" : "Assign to this workspace"}
            </Button>
          </CardRow>
        ))}
      </div>
      {!eligibility.connectedPlatforms.length && <p className="mt-3 text-[12.5px] text-sx-text-muted">Connect at least one social account to continue.</p>}
      {error && <p className="mt-2 text-[12.5px] text-[#FF8A90]">{error}</p>}
      <div className="mt-4">
        <Button variant="primary" disabled={!ready || activating || platforms.length === 0} onClick={() => void activate()}>
          {activating ? "Activating…" : "Activate Social Autopilot"}
        </Button>
      </div>
    </Card>
  );
}

function UpcomingRow({ item, tenantId, timezone, onChanged }: { item: UpcomingItem; tenantId: string; timezone: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [preview, setPreview] = useState<PackagePublishPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduledWall, setScheduledWall] = useState(() => item.scheduledWall);
  const [busy, setBusy] = useState(false);

  const skip = async () => {
    setBusy(true);
    try {
      await callAutopilotApi({ tenantId, action: "skip", queueItemId: item.id });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  // Real bug fixed live: a REVIEW_BEFORE_PUBLISH post reaching "Ready for
  // review" previously had no action anywhere -- not this button, not the
  // backend -- that ever moved it forward, so it sat here forever. Approve
  // hands it to the normal scheduled-publish pipeline at its existing
  // time; Approve & Publish Now also pulls that time forward to right now.
  const approve = async (publishNow: boolean) => {
    setBusy(true);
    try {
      await callAutopilotApi({ tenantId, action: "approve", queueItemId: item.id, publishNow });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await callAutopilotApi({ tenantId, action: "edit", queueItemId: item.id, caption, hashtags: hashtags.split(/[,\s]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean) });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const openPreview = async () => {
    setPreviewLoading(true);
    try {
      const result = await callAutopilotApi({ tenantId, action: "preview", queueItemId: item.id });
      setPreview(result.preview as PackagePublishPreview);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <CardRow className="flex-col items-start gap-1.5">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-medium text-sx-text">Post {item.sequence} · {item.platform ?? "—"}{item.accountLabel ? ` · ${item.accountLabel}` : ""}</span>
        <span className="flex items-center gap-1.5">
          {item.qualityScore != null && (
            <StatusChip state={item.qualityScore >= 90 ? "success" : item.qualityScore >= 70 ? "warning" : "danger"}>Quality {item.qualityScore}/100</StatusChip>
          )}
          <StatusChip state={item.status === "BLOCKED" ? "danger" : "accent"}>{STATUS_LABEL[item.status] ?? item.status}</StatusChip>
        </span>
      </div>
      <span className="text-sx-text-muted">{formatDate(item.scheduledAt, timezone)}{item.contentPillar ? ` · ${item.contentPillar}` : ""}{item.concept ? ` · ${item.concept}` : ""}</span>
      {item.blockedReason && <span className="text-[#FF8A90]">{item.blockedReason}</span>}
      {preview && <PackagePublishPreviewCard preview={preview} onClose={() => setPreview(null)} />}
      {rescheduling && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" value={scheduledWall} onChange={(event) => setScheduledWall(event.target.value)} className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2" />
          <span className="text-[11px] text-sx-text-subtle">{timezone}</span>
          <Button
            size="sm"
            onClick={() =>
              void callAutopilotApi({ tenantId, action: "reschedule", queueItemId: item.id, scheduledWall }).then(() => {
                setRescheduling(false);
                onChanged();
              })
            }
          >
            Save time
          </Button>
        </div>
      )}
      {editing ? (
        <div className="mt-1 flex w-full flex-col gap-2">
          <textarea className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2 text-sx-text" rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} />
          <input className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2 text-sx-text" value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#hashtags" />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Discard</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveEdit()}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          {item.status === "REVIEW_REQUIRED" && (
            <>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void approve(false)}>Approve</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void approve(true)}>Approve &amp; Publish Now</Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={busy || previewLoading || item.status === "PLANNED" || item.status === "BLOCKED"} onClick={() => void openPreview()}>
            {previewLoading ? "Loading…" : "Preview"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || item.status === "PLANNED" || item.status === "BLOCKED"} onClick={() => { setCaption(item.caption); setHashtags(item.hashtags.map((tag) => `#${tag}`).join(" ")); setEditing(true); }}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setScheduledWall(item.scheduledWall); setRescheduling((value) => !value); }}>Reschedule</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void skip()}>Skip</Button>
        </div>
      )}
    </CardRow>
  );
}

export function AutopilotDashboard() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId ?? null;
  const [data, setData] = useState<Overview | NotActivated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(() => {
    if (!tenantId) return;
    fetch(`/api/platform/social/autopilot?tenantId=${encodeURIComponent(tenantId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load Autopilot"))))
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Autopilot"));
  }, [tenantId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!tenantId) return null;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <p className="text-sm text-sx-text-muted">Loading Autopilot…</p>;

  // Visual style preferences and manual/on-demand generation (Subscription-
  // Gated Visual Archetypes brief) are their own Growth+ capability, gated
  // only by plan tier -- NOT by whether the separate automated package
  // queue (social_autopilot_authorizations) has finished its own brand/
  // entitlement/connected-account activation checklist below. A Growth
  // tenant who hasn't activated the automated package yet can still pick a
  // visual style and generate manually today; rendering these only inside
  // the "activated" branch (a real bug found during live verification --
  // they were unreachable for any tenant still on the setup checklist) hid
  // an entire Growth+ capability behind an unrelated precondition.
  if (!data.activated) {
    return (
      <div className="flex flex-col gap-4">
        <VisualStyleCard tenantId={tenantId} />
        <ManualArchetypeGeneration tenantId={tenantId} />
        <ActivationChecklist tenantId={tenantId} eligibility={data.eligibility} onActivated={load} />
      </div>
    );
  }

  const runControl = async (action: "pause" | "resume" | "cancel") => {
    setBusyAction(true);
    try {
      await callAutopilotApi({ tenantId, action, authorizationId: data.authorizationId });
    } finally {
      setBusyAction(false);
      load();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card variant="ai">
        <div className="flex items-center justify-between gap-3">
          <CardHeading>Social Autopilot</CardHeading>
          <StatusChip state={STATE_CHIP[data.stateLabel] ?? "neutral"}>{data.stateLabel}</StatusChip>
        </div>
        <p className="mt-2 text-sm text-sx-text-muted">
          {data.compositionLabel} · {data.packageSize} units / service period · {data.publishingMode === "AUTO_PUBLISH" ? "Auto-publish" : "Review before publish"} · {data.timezone}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><div className="text-sx-text-subtle">Published</div><div className="text-lg font-semibold text-sx-text">{data.published}</div></div>
          <div><div className="text-sx-text-subtle">Remaining</div><div className="text-lg font-semibold text-sx-text">{data.remaining}</div></div>
          <div><div className="text-sx-text-subtle">Period</div><div>{formatDate(data.periodStart, data.timezone)} → {formatDate(data.periodEnd, data.timezone)}</div></div>
          <div><div className="text-sx-text-subtle">Destinations</div><div>{data.destinations.join(", ") || "—"}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.state === "ACTIVE" && <Button size="sm" disabled={busyAction} onClick={() => void runControl("pause")}>Pause Autopilot</Button>}
          {(data.state === "PAUSED" || data.state === "NEEDS_ATTENTION") && <Button size="sm" variant="primary" disabled={busyAction} onClick={() => void runControl("resume")}>Resume Autopilot</Button>}
          {data.state !== "CANCELLED" && <Button size="sm" variant="danger" disabled={busyAction} onClick={() => void runControl("cancel")}>Cancel Autopilot</Button>}
        </div>
      </Card>

      <VisualStyleCard tenantId={tenantId} />
      <ManualArchetypeGeneration tenantId={tenantId} />

      <Card variant="panel">
        <CardHeading>Upcoming</CardHeading>
        {data.upcoming.length === 0 ? (
          <EmptyState title="Nothing queued yet." subtitle="Your next posts will appear here once prepared." />
        ) : (
          <div className="mt-2">
            {data.upcoming.map((item) => (
              <UpcomingRow key={item.id} item={item} tenantId={tenantId} timezone={data.timezone} onChanged={load} />
            ))}
          </div>
        )}
      </Card>

      <Card variant="nested">
        <CardHeading>History</CardHeading>
        {data.history.length === 0 ? (
          <EmptyState title="Nothing published yet." subtitle="Delivered posts will show up here with their live link." />
        ) : (
          <div className="mt-2">
            {data.history.map((item) => (
              <CardRow key={item.id} className="justify-between">
                <span>Post {item.sequence} · {item.platform ?? "—"}</span>
                <span className="flex items-center gap-2">
                  <StatusChip state={item.status === "PUBLISHED" ? "success" : item.status === "FAILED" ? "danger" : "neutral"}>{item.status}</StatusChip>
                  {item.permalink && <a className="text-sx-accent underline" href={item.permalink} target="_blank" rel="noreferrer">View post</a>}
                  {item.error && <span className="text-[#FF8A90]">{item.error}</span>}
                </span>
              </CardRow>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
