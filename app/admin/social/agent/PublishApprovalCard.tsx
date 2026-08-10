"use client";

import { useEffect, useState } from "react";
import {
  getActionPreviewAction,
  editProposedPublishActionAction,
} from "./actions";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";

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
}: {
  action: { id: string; tool: string; input: Record<string, unknown> };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
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
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [action.id]);

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
      <div className="saut-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--saut-ai)" }}>Ready to publish</div>

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

          {preview.shadowMode && (
            <p className="saut-publish-warning" role="note">
              SHADOW MODE — this will be processed but not published externally.
            </p>
          )}

          {!resolved && (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={() => setEditing(true)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Edit</button>
              <button onClick={() => decide(onReject)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">Cancel</button>
              <button onClick={() => decide(onApprove)} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]">Approve &amp; Publish</button>
            </div>
          )}
        </>
      )}
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
  return (
    <div className="mt-2 space-y-2">
      {actions.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => actions.forEach((action) => onApprove(action.id))}
            className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]"
          >
            Approve all ({actions.length})
          </button>
        </div>
      )}
      {actions.map((action) => (
        <ReadyToPublishCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} />
      ))}
    </div>
  );
}
