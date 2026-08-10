"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActionPreviewAction,
  editProposedPublishActionAction,
} from "./actions";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PlatformPreviewModal } from "./PlatformPreviewModal";

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

function MediaPreview({ assetId }: { assetId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/social/copilot/media-preview?assetId=${encodeURIComponent(assetId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result) return;
        setUrl(result.url);
        setMimeType(result.mimeType ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  if (!url) return <div className="saut-publish-media-placeholder" aria-hidden />;
  if (mimeType.startsWith("video/")) {
    return <video src={url} className="saut-publish-media" muted playsInline controls={false} />;
  }
  return <img src={url} alt="" className="saut-publish-media" />;
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
      <section className="saut-publish-card" aria-label="Preparing publish preview">
        <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Preparing your post…</p>
      </section>
    );
  }
  if (!preview) return null;

  const decide = (fn: (id: string) => void) => {
    setResolved(true);
    fn(action.id);
  };

  return (
    <section className="saut-publish-card" aria-label="Ready to publish">
      {!grouped && <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-ai)" }}>Ready to publish</div>}

      {preview.mediaAssetIds[0] && <MediaPreview assetId={preview.mediaAssetIds[0]} />}

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="saut-input w-full text-[12.5px]"
            rows={4}
            aria-label="Caption"
          />
          <input
            value={hashtags}
            onChange={(event) => setHashtags(event.target.value)}
            className="saut-input w-full text-xs"
            aria-label="Hashtags"
            placeholder="#hashtags"
          />
          {preview.tool === "schedule_post" && (
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={scheduleMode === "now"} onChange={() => setScheduleMode("now")} /> Now
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={scheduleMode === "custom"} onChange={() => setScheduleMode("custom")} /> Scheduled
              </label>
              {scheduleMode === "custom" && (
                <input
                  type="datetime-local"
                  value={customWhen}
                  onChange={(event) => setCustomWhen(event.target.value)}
                  className="saut-input text-xs"
                  aria-label="Publish date and time"
                />
              )}
            </div>
          )}
          {error && <p className="text-xs" role="alert" style={{ color: "var(--saut-danger)" }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]" disabled={saving}>Discard</button>
            <button onClick={() => void saveEdit()} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {preview.caption && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed">{preview.caption}</p>}
          {preview.hashtags.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--saut-ai)" }}>{preview.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
          )}

          <dl className="saut-publish-meta mt-3">
            <div><dt>Platform</dt><dd>{preview.platformLabel ?? "—"}</dd></div>
            <div><dt>Account</dt><dd>{preview.accountLabel ?? "Not resolved"}</dd></div>
            <div><dt>Publish</dt><dd>{formatWhen(preview.scheduledAt, preview.isImmediate)}</dd></div>
            {preview.visibility && <div><dt>Visibility</dt><dd>{preview.visibility}</dd></div>}
          </dl>

          {!grouped && preview.shadowMode && (
            <p className="saut-publish-warning" role="note">
              SHADOW MODE — this will be processed but not published externally.
            </p>
          )}

          {!resolved && !grouped && (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={() => setEditing(true)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Edit</button>
              <button onClick={() => decide(onReject)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Cancel</button>
              <button onClick={() => decide(onApprove)} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]">Approve &amp; Publish</button>
            </div>
          )}
          {grouped && !resolved && (
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setPreviewOpen(true)} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">Preview</button>
              <button onClick={() => setEditing(true)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Edit</button>
            </div>
          )}
        </>
      )}
      {previewOpen && <PlatformPreviewModal preview={preview} onClose={() => setPreviewOpen(false)} onEdit={() => { setPreviewOpen(false); setEditing(true); }} onApprove={() => { setPreviewOpen(false); decide(onApprove); }} />}
    </section>
  );
}

/**
 * Renders every publish-intent action attached to one Copilot message as ONE
 * grouped "Ready to publish" experience — a single request that produced N
 * platform destinations (e.g. "post on Threads, Facebook and LinkedIn")
 * surfaces together with one "Approve all" affordance instead of forcing N
 * separate approval interruptions (Section 5 of the follow-up brief).
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

  const handlePreviewLoaded = useCallback((actionId: string, preview: PublishActionPreview) => {
    setPreviews((current) => ({ ...current, [actionId]: preview }));
    setSelected((current) => current[actionId] === undefined
      ? { ...current, [actionId]: platformRecommendation(preview).recommended }
      : current);
  }, []);

  const selectedActions = actions.filter((action) => selected[action.id] ?? platformRecommendation(previews[action.id]).recommended);
  const anyShadowMode = Object.values(previews).some((preview) => preview.shadowMode);

  return (
    <section className="saut-publish-group mt-2" aria-label="Ready to publish combined approval">
      <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-ai)" }}>Ready to publish</div>
      {actions.length > 1 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold">Recommended platforms</h3>
          <ul className="mt-2 space-y-1.5">
            {actions.map((action) => {
              const preview = previews[action.id];
              const fit = platformRecommendation(preview);
              return (
                <li key={action.id} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected[action.id] ?? fit.recommended}
                    onChange={(event) => setSelected((current) => ({ ...current, [action.id]: event.target.checked }))}
                    aria-label={`Include ${preview?.platformLabel ?? "platform"}`}
                  />
                  <span>
                    <strong>{preview?.platformLabel ?? "Preparing platform"}</strong>
                    <span className="ml-1" style={{ color: fit.recommended ? "var(--saut-success)" : "var(--saut-text-subtle)" }}>
                      {fit.recommended ? "Recommended" : "Optional"}
                    </span>
                    <span className="block" style={{ color: "var(--saut-text-muted)" }}>{fit.reason}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="mt-3 space-y-2" aria-label="Platform previews">
        {actions.map((action) => (
          <ReadyToPublishCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} grouped onPreviewLoaded={handlePreviewLoaded} />
        ))}
      </div>
      {anyShadowMode && (
        <p className="saut-publish-warning" role="note">
          SHADOW MODE — these drafts will be processed but nothing will be published externally.
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button onClick={() => actions.forEach((action) => onReject(action.id))} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Cancel</button>
        <button
          onClick={() => selectedActions.forEach((action) => onApprove(action.id))}
          disabled={selectedActions.length === 0}
          className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]"
        >
          Approve selected &amp; publish ({selectedActions.length})
        </button>
      </div>
    </section>
  );
}
