"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PrivateMedia } from "./AttachmentMedia";

function AvatarFallback({ label, platform }: { label: string; platform?: string }) {
  const initial = (label.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <span className={`saut-preview-avatar-fallback saut-preview-avatar-${(platform || "other").toLowerCase()}`} aria-hidden>
      {initial}
    </span>
  );
}

function Profile({ preview }: { preview: PublishActionPreview }) {
  const handle = preview.accountHandle ? `@${preview.accountHandle.replace(/^@/, "")}` : null;
  const primary = preview.accountLabel || (preview.platformLabel ? `${preview.platformLabel} account` : "Account");
  const secondary =
    handle && handle.toLowerCase() !== `@${primary.replace(/^@/, "").toLowerCase()}` ? handle : handle || preview.platformLabel || "";
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showImg = Boolean(preview.accountAvatarUrl) && !avatarFailed;

  return (
    <div className="saut-preview-profile">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.accountAvatarUrl!} alt="" onError={() => setAvatarFailed(true)} />
      ) : (
        <AvatarFallback label={primary} platform={preview.platform} />
      )}
      <div>
        <strong>{primary}</strong>
        {secondary ? <small>{secondary}</small> : null}
      </div>
    </div>
  );
}

function mimeFor(preview: PublishActionPreview, index: number): string {
  return preview.mediaMimeTypes?.[index] || (preview.platform === "youtube" ? "video/mp4" : "image/jpeg");
}

function MediaCarousel({ preview, handoffToken }: { preview: PublishActionPreview; handoffToken?: string }) {
  const [index, setIndex] = useState(0);
  const assets = preview.mediaAssetIds;
  if (!assets.length) {
    return (
      <div className="saut-preview-carousel saut-preview-carousel-empty" role="status">
        No media attached to this prepared post.
      </div>
    );
  }
  return (
    <div className="saut-preview-carousel">
      <PrivateMedia
        assetId={assets[index]}
        mimeType={mimeFor(preview, index)}
        alt={`Post media ${index + 1} of ${assets.length}`}
        controls={mimeFor(preview, index).startsWith("video/") || preview.platform === "youtube"}
        handoffToken={handoffToken}
      />
      {assets.length > 1 ? (
        <>
          <button type="button" className="saut-carousel-prev" onClick={() => setIndex((index - 1 + assets.length) % assets.length)} aria-label="Previous image">
            ‹
          </button>
          <button type="button" className="saut-carousel-next" onClick={() => setIndex((index + 1) % assets.length)} aria-label="Next image">
            ›
          </button>
          <span className="saut-carousel-count">
            {index + 1}/{assets.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

function CaptionBlock({
  caption,
  platform,
  accountLabel,
  compact,
}: {
  caption?: string;
  platform: string;
  accountLabel?: string;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!caption) return null;
  const lines = platform === "instagram" || platform === "threads" ? 3 : 4;
  const needsCollapse = compact && caption.length > 180;
  const showFull = !needsCollapse || expanded;

  if (platform === "instagram" || platform === "youtube") {
    return (
      <div className="saut-preview-copy">
        <strong>{accountLabel}</strong>{" "}
        <span className={showFull ? undefined : "saut-preview-caption-clamp"} style={showFull ? undefined : ({ WebkitLineClamp: lines } as CSSProperties)}>
          {caption}
        </span>
        {needsCollapse ? (
          <button type="button" className="saut-preview-see-more" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "View full caption"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="saut-preview-copy-block">
      <p className={`saut-preview-copy${showFull ? "" : " saut-preview-caption-clamp"}`} style={showFull ? undefined : ({ WebkitLineClamp: lines } as CSSProperties)}>
        {caption}
      </p>
      {needsCollapse ? (
        <button type="button" className="saut-preview-see-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "…see more"}
        </button>
      ) : null}
    </div>
  );
}

function PlatformPost({
  preview,
  handoffToken,
  fitMode,
}: {
  preview: PublishActionPreview;
  handoffToken?: string;
  fitMode: boolean;
}) {
  const platform = preview.platform?.toLowerCase() || "other";
  const actions =
    platform === "linkedin"
      ? "Like   Comment   Repost   Send"
      : platform === "facebook"
        ? "Like   Comment   Share"
        : platform === "threads"
          ? "♡   Reply   Repost   Share"
          : platform === "youtube"
            ? "Like   Share   Save"
            : "♡   Comment   Share   Save";

  const captionBeforeMedia = platform === "linkedin" || platform === "facebook" || platform === "threads";

  return (
    <article
      className={`saut-platform-preview saut-platform-${platform}${fitMode ? " is-fit" : " is-natural"}`}
      data-platform={platform}
      data-preview-fit={fitMode ? "true" : "false"}
    >
      <Profile preview={preview} />
      {captionBeforeMedia ? (
        <CaptionBlock caption={preview.caption} platform={platform} accountLabel={preview.accountHandle || preview.accountLabel} compact={fitMode} />
      ) : null}
      <MediaCarousel preview={preview} handoffToken={handoffToken} />
      {!captionBeforeMedia ? (
        <CaptionBlock caption={preview.caption} platform={platform} accountLabel={preview.accountHandle || preview.accountLabel} compact={fitMode} />
      ) : null}
      {preview.hashtags.length ? (
        <p className="saut-preview-tags">{preview.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p>
      ) : null}
      <div className="saut-preview-actions" aria-hidden>
        {actions}
      </div>
    </article>
  );
}

export function PlatformPreviewModal({
  preview,
  onClose,
  onEdit,
  onApprove,
  handoffToken,
}: {
  preview: PublishActionPreview;
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => void;
  handoffToken?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [fitMode, setFitMode] = useState(true);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[href],input,textarea,[tabindex]:not([tabindex="-1"])')];
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="saut-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`saut-preview-dialog${fitMode ? " is-fit" : " is-natural"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-preview-title"
        tabIndex={-1}
        data-preview-mode={fitMode ? "fit" : "100"}
      >
        <header className="saut-preview-header">
          <div>
            <strong id="platform-preview-title">{preview.platformLabel} preview</strong>
            <small>Approximate appearance · actual prepared content</small>
          </div>
          <div className="saut-preview-mode-toggle" role="group" aria-label="Preview size">
            <button type="button" className={fitMode ? "is-on" : undefined} aria-pressed={fitMode} onClick={() => setFitMode(true)}>
              Fit
            </button>
            <button type="button" className={!fitMode ? "is-on" : undefined} aria-pressed={!fitMode} onClick={() => setFitMode(false)}>
              100%
            </button>
          </div>
          <button type="button" className="saut-preview-close" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </header>
        <main className="saut-preview-body">
          <div className={`saut-preview-stage${fitMode ? " is-fit" : ""}`}>
            <PlatformPost preview={preview} handoffToken={handoffToken} fitMode={fitMode} />
          </div>
        </main>
        <footer className="saut-preview-footer">
          <button type="button" className="saut-btn saut-btn-ghost" onClick={onClose}>
            Back
          </button>
          <button type="button" className="saut-btn saut-btn-secondary" onClick={onEdit}>
            Edit
          </button>
          {preview.approvalAllowed === false ? (
            <span className="saut-btn saut-btn-ghost !h-10 !px-4" style={{ color: "var(--saut-danger)", pointerEvents: "none" }}>
              Needs revision
            </span>
          ) : (
            <button type="button" className="saut-btn saut-btn-primary !h-10 !px-4" onClick={onApprove}>
              {preview.shadowMode ? "Approve shadow run" : "Approve selected & publish (1)"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
