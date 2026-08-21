"use client";

import { useCallback, useEffect, useState } from "react";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { SxPrivateMedia } from "./SxPrivateMedia";
import { getTenantActionPreviewAction, editTenantProposedPublishActionAction } from "./tenant-actions";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";

type ProposedAction = { id: string; tool: string; input: Record<string, unknown> };

function asPlatformIcon(platform: string | undefined): PlatformIconKey {
  const key = (platform || "").toLowerCase();
  if (key === "instagram" || key === "facebook" || key === "youtube" || key === "threads" || key === "linkedin" || key === "x" || key === "whatsapp") {
    return key as PlatformIconKey;
  }
  return "website";
}

function formatWhen(preview: PublishActionPreview): string {
  if (preview.isImmediate) return "Post now";
  if (preview.wallClockLabel) {
    const [datePart, timePart] = preview.wallClockLabel.split("T");
    return datePart && timePart ? `${datePart} ${timePart}` : preview.wallClockLabel;
  }
  if (!preview.scheduledAt) return "Post now";
  const date = new Date(preview.scheduledAt);
  return Number.isNaN(date.getTime()) ? "Post now" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One "Ready to publish" review — StratXcel Growth Assistant reference's
 * Publish/Multi/Trust card states, unified into one component (the shape
 * of the real data — trustStatus, approvalAllowed, shadowMode — decides
 * which of those three the card actually renders as, never a designer's
 * guess). Backed by the exact same real preview/approve/reject/edit
 * server actions the previous admin-styled workspace used
 * (tenant-actions.ts) — only the visual chrome changed.
 */
export function PublishReviewCard({
  action,
  tenantId,
  onApprove,
  onReject,
  grouped = false,
  checked,
  onToggleChecked,
  onPreviewLoaded,
}: {
  action: ProposedAction;
  tenantId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  grouped?: boolean;
  checked?: boolean;
  onToggleChecked?: () => void;
  onPreviewLoaded?: (preview: PublishActionPreview) => void;
}) {
  const [preview, setPreview] = useState<PublishActionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [activeActionId, setActiveActionId] = useState(action.id);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getTenantActionPreviewAction(tenantId, action.id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLoadError("Something went wrong while loading this review.");
          return;
        }
        setPreview(result);
        setActiveActionId(result.actionId || action.id);
        setCaption(result.caption ?? "");
        setHashtags((result.hashtags ?? []).map((tag) => `#${tag}`).join(" "));
        onPreviewLoaded?.(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Something went wrong while loading this review.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, tenantId, reloadToken]);

  useEffect(() => load(), [load]);

  async function saveEdit() {
    setSaving(true);
    setSaveError(null);
    try {
      const parsedHashtags = hashtags.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
      const updated = await editTenantProposedPublishActionAction(tenantId, activeActionId, { caption, hashtags: parsedHashtags });
      setPreview(updated);
      setActiveActionId(updated.actionId);
      onPreviewLoaded?.(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !preview) {
    return (
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4">
        <p className="text-xs text-sx-text-subtle">Preparing…</p>
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-4">
        <p className="text-sm text-sx-text">{loadError || "Something went wrong while loading this review."}</p>
        <button type="button" onClick={() => setReloadToken((n) => n + 1)} className="mt-2 text-xs font-semibold text-sx-accent">
          Try again
        </button>
      </div>
    );
  }

  const needsRevision = preview.approvalAllowed === false;
  const platformIconKey = asPlatformIcon(preview.platform);

  // Trust/brand revision card — StratXcel Growth Assistant reference "Trust" state.
  if (needsRevision) {
    return (
      <div className="rounded-sx-lg border-[1.5px] border-sx-warning/20 bg-sx-warning/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sx-sm bg-sx-warning/10 text-sx-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </span>
          <span className="text-[14px] font-semibold text-sx-warning">Needs revision</span>
        </div>
        <p className="text-[13px] leading-relaxed text-sx-text-muted">
          {preview.trustReasons?.length ? preview.trustReasons.slice(0, 3).join(" · ") : "Your brand guidelines flagged something in this draft before it can be approved."}
        </p>
        {!resolved && (
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-9 flex-1 rounded-sx-sm bg-sx-accent text-[13px] font-semibold text-sx-accent-on"
            >
              Edit &amp; revise
            </button>
            <button
              type="button"
              onClick={() => {
                setResolved(true);
                onReject(activeActionId);
              }}
              className="h-9 rounded-sx-sm border-[1.5px] border-sx-border px-3 text-[13px] font-semibold text-sx-text-muted"
            >
              Cancel
            </button>
          </div>
        )}
        {editing && (
          <div className="mt-2.5 space-y-2">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-[13px] text-sx-text"
            />
            {saveError && <p className="text-xs text-sx-danger">{saveError}</p>}
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="h-8 px-3 text-xs font-semibold text-sx-text-muted">Discard</button>
              <button type="button" onClick={() => void saveEdit()} disabled={saving} className="h-8 rounded-sx-sm bg-sx-accent px-3 text-xs font-semibold text-sx-accent-on">
                {saving ? "Saving…" : "Save & re-check"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const hasMedia = preview.mediaAssetIds.length > 0;
  const mediaCount = preview.mediaAssetIds.length;

  // Grouped row (Multi-platform state) — checkbox + icon + name + "Review" affordance.
  if (grouped) {
    return (
      <div
        onClick={onToggleChecked}
        className="flex cursor-pointer items-center gap-3 border-b border-sx-border px-3.5 py-3 last:border-b-0"
      >
        <span
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sx-xs border-[1.5px] transition-colors ${
            checked ? "border-sx-accent bg-sx-accent" : "border-sx-border bg-sx-surface-1"
          }`}
        >
          {checked && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
          )}
        </span>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted">
          <PlatformIcon name={platformIconKey} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-sx-text">{preview.platformLabel ?? "Platform"}</span>
          <span className="block truncate text-xs text-sx-text-subtle">{preview.accountLabel ?? preview.accountHandle ?? ""}</span>
        </span>
        <span className="shrink-0 text-xs text-sx-text-subtle">Review</span>
      </div>
    );
  }

  // Single-platform "Ready to publish" card — StratXcel Growth Assistant reference "Publish" state.
  return (
    <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1">
      <div className="flex items-center justify-between border-b border-sx-border px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sx-xs bg-sx-accent-muted">
            <PlatformIcon name={platformIconKey} className="h-3.5 w-3.5" />
          </span>
          <span>
            <span className="block text-[13px] font-bold text-sx-text">{preview.platformLabel ?? "Platform"}</span>
            <span className="block text-[11px] text-sx-text-subtle">{preview.accountLabel ?? preview.accountHandle ?? ""}</span>
          </span>
        </div>
        <span className={`rounded-sx-xs px-2 py-1 text-[11px] font-semibold ${preview.shadowMode ? "bg-sx-warning/10 text-sx-warning" : "bg-sx-warning/10 text-sx-warning"}`}>
          {preview.shadowMode ? "Shadow mode" : "Ready to publish"}
        </span>
      </div>

      {editing ? (
        <div className="space-y-2 p-3.5">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-[13px] text-sx-text"
          />
          <input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#hashtags"
            className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-xs text-sx-text"
          />
          {saveError && <p className="text-xs text-sx-danger">{saveError}</p>}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEditing(false)} className="h-8 px-3 text-xs font-semibold text-sx-text-muted">Discard</button>
            <button type="button" onClick={() => void saveEdit()} disabled={saving} className="h-8 rounded-sx-sm bg-sx-accent px-3 text-xs font-semibold text-sx-accent-on">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {hasMedia && (
            <div className="relative border-b border-sx-border bg-sx-surface-2">
              <SxPrivateMedia
                assetId={preview.mediaAssetIds[0]}
                mimeType={preview.mediaMimeTypes?.[0] || "image/jpeg"}
                className="block h-40 w-full object-cover"
              />
              {mediaCount > 1 && (
                <span className="absolute right-2 top-2 rounded-sx-xs bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
                  1 / {mediaCount}
                </span>
              )}
            </div>
          )}
          <div className="border-b border-sx-border px-3.5 py-3">
            {preview.caption && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-sx-text">{preview.caption}</p>}
            {preview.hashtags.length > 0 && (
              <p className="mt-1.5 text-xs text-sx-text-subtle">{preview.hashtags.map((t) => `#${t}`).join(" ")}</p>
            )}
            {preview.visibility && <p className="mt-1.5 text-xs text-sx-text-subtle">Visibility · {preview.visibility}</p>}
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-[13px] text-sx-text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Schedule
            </span>
            <span className="text-[13px] font-semibold text-sx-text">{formatWhen(preview)}</span>
          </div>
          {preview.shadowMode && (
            <p className="border-t border-sx-border px-3.5 py-2 text-[11px] text-sx-warning">
              Shadow mode — this will be prepared but not published externally.
            </p>
          )}
          {!resolved && !grouped && (
            <div className="flex gap-2 px-3.5 pb-3.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setResolved(true);
                  onReject(activeActionId);
                }}
                className="h-10 rounded-sx-sm border-[1.5px] border-sx-border px-3 text-[13px] font-semibold text-sx-text-muted"
              >
                Cancel
              </button>
              <button type="button" onClick={() => setEditing(true)} className="h-10 rounded-sx-sm border-[1.5px] border-sx-border px-3 text-[13px] font-semibold text-sx-text-muted">
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setResolved(true);
                  onApprove(activeActionId);
                }}
                className="flex h-10 flex-1 items-center justify-center gap-1 rounded-sx-sm bg-sx-accent text-[13px] font-bold text-sx-accent-on"
              >
                Approve &amp; Publish
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Multi-platform combined review — StratXcel Growth Assistant reference
 * "Multi" state: one card, per-platform checkbox rows, one combined
 * approve button. Real recommendation defaults come from each preview's
 * own recommendationTier, same as the previous admin-styled workspace.
 */
export function PublishReviewGroup({
  actions,
  tenantId,
  onApprove,
  onReject,
}: {
  actions: ProposedAction[];
  tenantId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [previews, setPreviews] = useState<Record<string, PublishActionPreview>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [resolved, setResolved] = useState(false);

  const handlePreviewLoaded = useCallback((preview: PublishActionPreview) => {
    setPreviews((current) => ({ ...current, [preview.actionId]: preview }));
    setSelected((current) =>
      current[preview.actionId] === undefined ? { ...current, [preview.actionId]: preview.recommendationTier !== "optional" } : current
    );
  }, []);

  const anyRevision = actions.some((a) => previews[a.id]?.approvalAllowed === false);
  const selectedIds = actions.filter((a) => selected[a.id] ?? true).map((a) => a.id);

  return (
    <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1">
      <div className="border-b border-sx-border px-3.5 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Ready to publish</p>
      </div>
      {actions.map((action) => (
        <PublishReviewCard
          key={action.id}
          action={action}
          tenantId={tenantId}
          onApprove={onApprove}
          onReject={onReject}
          grouped
          checked={selected[action.id] ?? true}
          onToggleChecked={() => setSelected((current) => ({ ...current, [action.id]: !(current[action.id] ?? true) }))}
          onPreviewLoaded={handlePreviewLoaded}
        />
      ))}
      {!resolved && (
        <div className="p-3.5">
          <button
            type="button"
            disabled={selectedIds.length === 0 || anyRevision}
            onClick={() => {
              setResolved(true);
              selectedIds.forEach((id) => onApprove(id));
              actions.filter((a) => !selectedIds.includes(a.id)).forEach((a) => onReject(a.id));
            }}
            className="flex h-11 w-full items-center justify-center gap-1 rounded-sx-md bg-sx-accent text-[14px] font-bold text-sx-accent-on disabled:opacity-50"
          >
            {anyRevision ? "Needs revision" : "Approve selected & Publish"}
            {!anyRevision && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
