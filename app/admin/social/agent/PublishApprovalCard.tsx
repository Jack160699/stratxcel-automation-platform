"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActionPreviewAction,
  editProposedPublishActionAction,
} from "./actions";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PlatformPreviewModal } from "./PlatformPreviewModal";
import { PrivateMedia } from "./AttachmentMedia";

function formatWhen(iso: string | undefined, isImmediate: boolean): string {
  if (isImmediate) return "Now";
  if (!iso) return "Now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function platformRecommendation(preview: PublishActionPreview | undefined) {
  if (preview?.recommendationTier) {
    return {
      recommended: preview.recommendationTier === "recommended",
      reason: preview.recommendationReason || "Recommended from the creative, Brand Brain, and platform fit.",
    };
  }
  const platform = preview?.platform?.toLowerCase();
  if (platform === "facebook") return { recommended: false, reason: "Broad, accessible reach; useful as an optional secondary version." };
  if (platform === "instagram") return { recommended: true, reason: "Strong fit for visual engagement and concise, expressive copy." };
  if (platform === "linkedin") return { recommended: true, reason: "Strong fit for a professional founder or business-value angle." };
  if (platform === "threads") return { recommended: true, reason: "Strong fit for short, natural commentary and conversation." };
  return { recommended: true, reason: "Available connected destination with a prepared platform-specific version." };
}

function mimeFor(preview: PublishActionPreview, index = 0): string {
  return preview.mediaMimeTypes?.[index] || (preview.platform === "youtube" ? "video/mp4" : "image/jpeg");
}

function MediaThumb({ preview }: { preview: PublishActionPreview }) {
  const assetId = preview.mediaAssetIds[0];
  if (!assetId) {
    return <div className="saut-artifact-media saut-artifact-media-empty" aria-hidden />;
  }
  const mime = mimeFor(preview, 0);
  const count = preview.mediaAssetIds.length;
  return (
    <div className={`saut-artifact-media${mime.startsWith("video/") ? " saut-artifact-media-video" : ""}`}>
      <PrivateMedia assetId={assetId} mimeType={mime} alt="" className="saut-artifact-media-el" />
      {mime.startsWith("video/") ? <span className="saut-artifact-play" aria-hidden>▶</span> : null}
      {count > 1 ? <span className="saut-artifact-count">{count}</span> : null}
    </div>
  );
}

function CaptionExcerpt({ caption, expanded, onToggle }: { caption?: string; expanded: boolean; onToggle: () => void }) {
  if (!caption) return null;
  const long = caption.length > 160 || caption.split("\n").length > 4;
  return (
    <div className="saut-artifact-caption">
      <p className={expanded ? "" : "saut-artifact-caption-clamp"}>{caption}</p>
      {long ? (
        <button type="button" className="saut-artifact-expand" onClick={onToggle}>
          {expanded ? "Show less" : "Expand"}
        </button>
      ) : null}
    </div>
  );
}

function ReadyToPublishCard({
  action,
  onApprove,
  onReject,
  grouped = false,
  onPreviewLoaded,
}: {
  action: { id: string; tool: string; input: Record<string, unknown> };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  grouped?: boolean;
  onPreviewLoaded?: (actionId: string, preview: PublishActionPreview) => void;
}) {
  const [preview, setPreview] = useState<PublishActionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "custom">("now");
  const [customWhen, setCustomWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActionPreviewAction(action.id)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setCaption(result?.caption ?? "");
        setHashtags((result?.hashtags ?? []).map((tag) => `#${tag}`).join(" "));
        setScheduleMode(result?.isImmediate ? "now" : "custom");
        setCustomWhen(toDatetimeLocal(result?.scheduledAt));
        if (result) onPreviewLoaded?.(action.id, result);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [action.id, onPreviewLoaded]);

  const saveEdit = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedHashtags = hashtags
        .split(/[,\s]+/)
        .map((tag) => tag.replace(/^#/, "").trim())
        .filter(Boolean);
      const patch: { caption?: string; hashtags?: string[]; scheduledAt?: string } = { caption, hashtags: parsedHashtags };
      if (preview?.tool === "schedule_post") {
        patch.scheduledAt = scheduleMode === "now" ? new Date().toISOString() : new Date(customWhen).toISOString();
      }
      const updated = await editProposedPublishActionAction(action.id, patch);
      setPreview(updated);
      setEditing(false);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="saut-publish-card saut-artifact-card" aria-label="Preparing publish preview">
        <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Preparing…</p>
      </section>
    );
  }
  if (!preview) return null;

  const decide = (fn: (id: string) => void) => {
    setResolved(true);
    fn(action.id);
  };

  const handle = preview.accountHandle ? `@${preview.accountHandle.replace(/^@/, "")}` : null;

  return (
    <section className="saut-publish-card saut-artifact-card" aria-label="Ready to publish">
      {!grouped && <div className="saut-artifact-eyebrow">Ready for review</div>}

      <header className="saut-artifact-head">
        <div className="min-w-0">
          <strong className="saut-artifact-platform">{preview.platformLabel ?? "Post"}</strong>
          <span className="saut-artifact-account truncate">
            {preview.accountLabel ?? "Account"}
            {handle && handle.toLowerCase() !== `@${(preview.accountLabel || "").replace(/^@/, "").toLowerCase()}`
              ? ` · ${handle}`
              : handle && !(preview.accountLabel ?? "").includes("@")
                ? ` · ${handle}`
                : ""}
          </span>
        </div>
        <span className="saut-artifact-when">{formatWhen(preview.scheduledAt, preview.isImmediate)}</span>
      </header>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} className="saut-input w-full text-[12.5px]" rows={4} aria-label="Caption" />
          <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} className="saut-input w-full text-xs" aria-label="Hashtags" placeholder="#hashtags" />
          {preview.tool === "schedule_post" && (
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} /> Now
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={scheduleMode === "custom"} onChange={() => setScheduleMode("custom")} /> Scheduled
              </label>
              {scheduleMode === "custom" && (
                <input type="datetime-local" value={customWhen} onChange={(event) => setCustomWhen(event.target.value)} className="saut-input text-xs" aria-label="Publish date and time" />
              )}
            </div>
          )}
          {error && (
            <p className="text-xs" role="alert" style={{ color: "var(--saut-danger)" }}>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="saut-btn saut-btn-ghost !h-8 !px-3 text-[12px]" disabled={saving}>
              Discard
            </button>
            <button onClick={() => void saveEdit()} className="saut-btn saut-btn-primary !h-8 !px-3 text-[12px]" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <MediaThumb preview={preview} />
          <CaptionExcerpt caption={preview.caption} expanded={captionExpanded} onToggle={() => setCaptionExpanded((value) => !value)} />
          {preview.hashtags.length > 0 && (
            <p className="saut-artifact-tags">{preview.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
          )}
          {preview.visibility && <p className="saut-artifact-meta">Visibility · {preview.visibility}</p>}

          {!grouped && preview.shadowMode && (
            <p className="saut-publish-warning" role="note">
              SHADOW MODE — this will be processed but not published externally.
            </p>
          )}

          {!resolved && !grouped && (
            <div className="saut-artifact-actions">
              <button onClick={() => setPreviewOpen(true)} className="saut-btn saut-btn-secondary !h-9 !px-3 text-[12px]">Preview</button>
              <button onClick={() => setEditing(true)} className="saut-btn saut-btn-ghost !h-9 !px-3 text-[12px]">Edit</button>
              <button onClick={() => decide(onReject)} className="saut-btn saut-btn-ghost !h-9 !px-3 text-[12px]">Cancel</button>
              <button onClick={() => decide(onApprove)} className="saut-btn saut-btn-primary !h-10 !px-4 text-[13px]">
                {preview.shadowMode ? "Approve shadow run" : "Approve & Publish"}
              </button>
            </div>
          )}
          {grouped && !resolved && (
            <div className="saut-artifact-actions">
              <button onClick={() => setPreviewOpen(true)} className="saut-btn saut-btn-secondary !h-9 !px-3 text-[12px]">Preview</button>
              <button onClick={() => setEditing(true)} className="saut-btn saut-btn-ghost !h-9 !px-3 text-[12px]">Edit</button>
            </div>
          )}
        </>
      )}
      {previewOpen && (
        <PlatformPreviewModal
          preview={preview}
          onClose={() => setPreviewOpen(false)}
          onEdit={() => {
            setPreviewOpen(false);
            setEditing(true);
          }}
          onApprove={() => {
            setPreviewOpen(false);
            decide(onApprove);
          }}
        />
      )}
    </section>
  );
}

/**
 * Renders every publish-intent action attached to one Copilot message as ONE
 * grouped "Ready to publish" experience — a single request that produced N
 * platform destinations surfaces together with one sticky combined approval.
 */
export function PublishApprovalGroup({
  actions,
  onApprove,
  onReject,
}: {
  actions: Array<{ id: string; tool: string; input: Record<string, unknown> }>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [previews, setPreviews] = useState<Record<string, PublishActionPreview>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reasonsOpen, setReasonsOpen] = useState(false);

  const handlePreviewLoaded = useCallback((actionId: string, preview: PublishActionPreview) => {
    setPreviews((current) => ({ ...current, [actionId]: preview }));
    setSelected((current) =>
      current[actionId] === undefined ? { ...current, [actionId]: platformRecommendation(preview).recommended } : current
    );
  }, []);

  const selectedActions = actions.filter((action) => selected[action.id] ?? platformRecommendation(previews[action.id]).recommended);
  const anyShadowMode = Object.values(previews).some((preview) => preview.shadowMode);
  const mediaCount = new Set(Object.values(previews).flatMap((preview) => preview.mediaAssetIds)).size;
  const platformNames = actions
    .map((action) => previews[action.id]?.platformLabel)
    .filter(Boolean) as string[];

  return (
    <section className="saut-publish-group saut-artifact-group" aria-label="Ready to publish combined approval">
      <header className="saut-artifact-group-head">
        <div>
          <div className="saut-artifact-eyebrow">Ready for review</div>
          <h3 className="saut-artifact-title">
            {actions.length} {actions.length === 1 ? "post" : "posts"} prepared
            {mediaCount > 0 ? ` from ${mediaCount} ${mediaCount === 1 ? "image" : "media items"}` : ""}
          </h3>
          <p className="saut-artifact-summary">
            {platformNames.length ? platformNames.join(" · ") : "Preparing platforms…"}
            {anyShadowMode ? " · No external publishing yet" : ""}
          </p>
        </div>
      </header>

      {actions.length > 1 && (
        <div className="saut-platform-chips" aria-label="Recommended platforms">
          <span className="saut-platform-chips-label">Recommended</span>
          {actions.map((action) => {
            const preview = previews[action.id];
            const fit = platformRecommendation(preview);
            const checked = selected[action.id] ?? fit.recommended;
            return (
              <label key={action.id} className={`saut-platform-chip${checked ? " is-on" : ""}`} title={fit.reason}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setSelected((current) => ({ ...current, [action.id]: event.target.checked }))}
                  aria-label={`Include ${preview?.platformLabel ?? "platform"}`}
                />
                <span>{preview?.platformLabel ?? "…"}</span>
                <em>{fit.recommended ? "Recommended" : "Optional"}</em>
              </label>
            );
          })}
          <button type="button" className="saut-platform-why" onClick={() => setReasonsOpen((value) => !value)}>
            {reasonsOpen ? "Hide reasons" : "Why these?"}
          </button>
        </div>
      )}
      {reasonsOpen && (
        <ul className="saut-platform-reasons">
          {actions.map((action) => {
            const preview = previews[action.id];
            const fit = platformRecommendation(preview);
            return (
              <li key={action.id}>
                <strong>{preview?.platformLabel ?? "Platform"}</strong> — {fit.reason}
              </li>
            );
          })}
        </ul>
      )}

      <div className="saut-artifact-grid" aria-label="Platform previews">
        {actions.map((action) => (
          <ReadyToPublishCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} grouped onPreviewLoaded={handlePreviewLoaded} />
        ))}
      </div>

      {anyShadowMode && (
        <p className="saut-publish-warning" role="note">
          SHADOW MODE — these drafts will be processed but nothing will be published externally.
        </p>
      )}

      <div className="saut-sticky-approve" role="region" aria-label="Combined approval">
        <div className="saut-sticky-approve-meta">
          <strong>
            {selectedActions.length} selected
          </strong>
          <span>
            {selectedActions
              .map((action) => previews[action.id]?.platformLabel)
              .filter(Boolean)
              .join(" · ") || "Choose platforms"}
          </span>
        </div>
        <div className="saut-sticky-approve-actions">
          <button onClick={() => actions.forEach((action) => onReject(action.id))} className="saut-btn saut-btn-ghost !h-10 !px-3 text-[12px]">
            Cancel
          </button>
          <button
            onClick={() => selectedActions.forEach((action) => onApprove(action.id))}
            disabled={selectedActions.length === 0}
            aria-label="Approve selected &amp; publish"
            className="saut-btn saut-btn-primary !h-11 !px-4 text-[13px]"
          >
            {anyShadowMode ? `Approve shadow run (${selectedActions.length})` : `Approve selected & publish (${selectedActions.length})`}
          </button>
        </div>
      </div>
    </section>
  );
}
