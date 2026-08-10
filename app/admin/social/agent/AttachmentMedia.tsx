"use client";

import { useEffect, useState } from "react";
import type { AgentAttachmentData } from "./AgentMessage";

export function humanFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function humanFileType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Photo";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Voice note";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("json")) return "JSON";
  if (mimeType.includes("csv")) return "Spreadsheet";
  return "Document";
}

function statusLabel(status: AgentAttachmentData["processingStatus"]) {
  if (status === "FAILED") return "Couldn’t read";
  if (status === "UPLOADED") return "Processing";
  return "Ready";
}

function PrivateMediaInner({
  assetId,
  mimeType,
  alt,
  controls,
  handoffToken,
  className,
  onRetry,
}: {
  assetId: string;
  mimeType: string;
  alt: string;
  controls: boolean;
  handoffToken?: string;
  className?: string;
  onRetry: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolvedMimeType, setResolvedMimeType] = useState(mimeType);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const endpoint = handoffToken
      ? `/api/social/copilot/whatsapp-media?assetId=${encodeURIComponent(assetId)}&token=${encodeURIComponent(handoffToken)}`
      : `/api/social/copilot/media-preview?assetId=${encodeURIComponent(assetId)}`;
    fetch(endpoint)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof body.error === "string" ? body.error : "Media preview unavailable.");
        }
        return body as { url?: string; mimeType?: string };
      })
      .then((result) => {
        if (!active) return;
        if (!result?.url) {
          setError("Media preview unavailable.");
          return;
        }
        setUrl(result.url);
        setResolvedMimeType(result.mimeType || mimeType);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Media preview unavailable.");
      });
    return () => {
      active = false;
    };
  }, [assetId, mimeType, handoffToken]);

  if (error) {
    return (
      <div className={`saut-media-error ${className ?? ""}`} role="alert">
        <span>{error}</span>
        <button type="button" className="saut-btn saut-btn-ghost !h-7 !px-2 text-[11px]" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (!url) return <span className={`saut-media-skeleton ${className ?? ""}`} aria-label="Loading media preview" />;
  if (resolvedMimeType.startsWith("video/")) {
    return <video src={url} className={`saut-attachment-media ${className ?? ""}`} controls={controls} muted={!controls} playsInline />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={`saut-attachment-media ${className ?? ""}`} />
  );
}

/**
 * Owner-scoped private media thumbnail. Surfaces an explicit error when the
 * signed URL cannot be minted — never a silent empty rectangle.
 */
export function PrivateMedia({
  assetId,
  mimeType,
  alt = "Attached media",
  controls = false,
  handoffToken,
  className,
}: {
  assetId: string;
  mimeType: string;
  alt?: string;
  controls?: boolean;
  handoffToken?: string;
  className?: string;
}) {
  const [retryToken, setRetryToken] = useState(0);
  return (
    <PrivateMediaInner
      key={`${assetId}:${retryToken}`}
      assetId={assetId}
      mimeType={mimeType}
      alt={alt}
      controls={controls}
      handoffToken={handoffToken}
      className={className}
      onRetry={() => setRetryToken((value) => value + 1)}
    />
  );
}

export function AttachmentCard({
  attachment,
  compact = false,
}: {
  attachment: AgentAttachmentData;
  /** READY review: compact source strip instead of large in-thread media. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visual = attachment.mediaAssetId && (attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/"));

  if (compact && visual) {
    return (
      <>
        <article className="saut-source-strip" aria-label={`Source · ${attachment.name}`}>
          <button type="button" className="saut-source-strip-thumb" onClick={() => setOpen(true)} aria-label={`Open ${attachment.name}`}>
            <PrivateMedia assetId={attachment.mediaAssetId!} mimeType={attachment.mimeType} alt="" className="saut-source-strip-media" />
          </button>
          <span className="saut-source-strip-meta min-w-0 flex-1">
            <strong className="block truncate">{attachment.name}</strong>
            <small>
              {humanFileType(attachment.mimeType)} · {statusLabel(attachment.processingStatus)}
            </small>
          </span>
          <button type="button" className="saut-btn saut-btn-ghost !h-8 !px-2 text-[11px]" onClick={() => setOpen(true)}>
            Open
          </button>
        </article>
        {open ? (
          <div className="saut-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
            <div className="saut-source-lightbox" role="dialog" aria-modal="true" aria-label={attachment.name}>
              <header>
                <strong className="truncate">{attachment.name}</strong>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                  ×
                </button>
              </header>
              <PrivateMedia
                assetId={attachment.mediaAssetId!}
                mimeType={attachment.mimeType}
                alt={attachment.name}
                controls={attachment.mimeType.startsWith("video/")}
                className="saut-source-lightbox-media"
              />
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <article className={`saut-file-card saut-history-attachment${visual ? " saut-file-card-visual" : ""}${compact ? " is-compact" : ""}`}>
      {visual ? (
        <PrivateMedia assetId={attachment.mediaAssetId!} mimeType={attachment.mimeType} alt={attachment.name} controls={attachment.mimeType.startsWith("video/")} />
      ) : (
        <span className="saut-file-icon" aria-hidden>
          {humanFileType(attachment.mimeType).slice(0, 3)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">{attachment.name}</strong>
        <span className="text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
          {humanFileType(attachment.mimeType)} · {statusLabel(attachment.processingStatus)}
        </span>
      </span>
    </article>
  );
}
