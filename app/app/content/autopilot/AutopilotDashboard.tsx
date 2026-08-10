"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

interface UpcomingItem {
  id: string;
  sequence: number;
  scheduledAt: string;
  status: string;
  contentPillar: string | null;
  blockedReason: string | null;
  platform: string | null;
  accountLabel: string | null;
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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
  const [error, setError] = useState<string | null>(null);
  const ready = eligibility.subscriptionActive && eligibility.entitlementAvailable && eligibility.brandConfigured && eligibility.connectedPlatforms.length > 0;

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
        <CardRow>{eligibility.brandConfigured ? "✓" : "○"} Brand configured</CardRow>
        <CardRow>{eligibility.entitlementAvailable ? "✓" : "○"} Social posts entitlement available ({eligibility.remainingUnits} remaining)</CardRow>
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

function UpcomingRow({ item, tenantId, onChanged }: { item: UpcomingItem; tenantId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
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
  const saveEdit = async () => {
    setBusy(true);
    try {
      await callAutopilotApi({ tenantId, action: "edit", queueItemId: item.id, caption });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardRow className="flex-col items-start gap-1.5">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-medium text-sx-text">Post {item.sequence} · {item.platform ?? "—"}{item.accountLabel ? ` · ${item.accountLabel}` : ""}</span>
        <StatusChip state={item.status === "BLOCKED" ? "danger" : "accent"}>{STATUS_LABEL[item.status] ?? item.status}</StatusChip>
      </div>
      <span className="text-sx-text-muted">{formatDate(item.scheduledAt)}{item.contentPillar ? ` · ${item.contentPillar}` : ""}</span>
      {item.blockedReason && <span className="text-[#FF8A90]">{item.blockedReason}</span>}
      {editing ? (
        <div className="mt-1 flex w-full flex-col gap-2">
          <textarea className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2 text-sx-text" rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Discard</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveEdit()}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex gap-2">
          <Button size="sm" variant="ghost" disabled={busy || item.status === "PLANNED" || item.status === "BLOCKED"} onClick={() => setEditing(true)}>Edit</Button>
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
  }, [load]);

  if (!tenantId) return null;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <p className="text-sm text-sx-text-muted">Loading Autopilot…</p>;

  if (!data.activated) return <ActivationChecklist tenantId={tenantId} eligibility={data.eligibility} onActivated={load} />;

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
          {data.packageSize} posts / service period · {data.publishingMode === "AUTO_PUBLISH" ? "Auto-publish" : "Review before publish"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
          <div><div className="text-sx-text-subtle">Published</div><div className="text-lg font-semibold text-sx-text">{data.published}</div></div>
          <div><div className="text-sx-text-subtle">Remaining</div><div className="text-lg font-semibold text-sx-text">{data.remaining}</div></div>
          <div><div className="text-sx-text-subtle">Period</div><div>{formatDate(data.periodStart)} → {formatDate(data.periodEnd)}</div></div>
          <div><div className="text-sx-text-subtle">Destinations</div><div>{data.destinations.join(", ") || "—"}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.state === "ACTIVE" && <Button size="sm" disabled={busyAction} onClick={() => void runControl("pause")}>Pause Autopilot</Button>}
          {(data.state === "PAUSED" || data.state === "NEEDS_ATTENTION") && <Button size="sm" variant="primary" disabled={busyAction} onClick={() => void runControl("resume")}>Resume Autopilot</Button>}
          {data.state !== "CANCELLED" && <Button size="sm" variant="danger" disabled={busyAction} onClick={() => void runControl("cancel")}>Cancel Autopilot</Button>}
        </div>
      </Card>

      <Card variant="panel">
        <CardHeading>Upcoming</CardHeading>
        {data.upcoming.length === 0 ? (
          <EmptyState title="Nothing queued yet." subtitle="Your next posts will appear here once prepared." />
        ) : (
          <div className="mt-2">
            {data.upcoming.map((item) => (
              <UpcomingRow key={item.id} item={item} tenantId={tenantId} onChanged={load} />
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
