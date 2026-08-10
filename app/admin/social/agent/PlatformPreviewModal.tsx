"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PrivateMedia } from "./AttachmentMedia";

function Profile({ preview }: { preview: PublishActionPreview }) {
  const handle = preview.accountHandle ? `@${preview.accountHandle.replace(/^@/, "")}` : null;
  const primary = preview.accountLabel || (preview.platformLabel ? `${preview.platformLabel} account` : "Account");
  const secondary = handle && handle.toLowerCase() !== `@${primary.replace(/^@/, "").toLowerCase()}` ? handle : handle || preview.platformLabel || "";
  return (
    <div className="saut-preview-profile">
      {preview.accountAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.accountAvatarUrl} alt="" />
      ) : (
        <span aria-hidden>{primary.slice(0, 1).toUpperCase()}</span>
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

function PlatformPost({ preview, handoffToken }: { preview: PublishActionPreview; handoffToken?: string }) {
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
  return (
    <article className={`saut-platform-preview saut-platform-${platform}`}>
      <Profile preview={preview} />
      {platform === "linkedin" || platform === "facebook" || platform === "threads" ? <p className="saut-preview-copy">{preview.caption}</p> : null}
      <MediaCarousel preview={preview} handoffToken={handoffToken} />
      {platform === "instagram" || platform === "youtube" || !["linkedin", "facebook", "threads"].includes(platform) ? (
        <p className="saut-preview-copy">
          <strong>{preview.accountHandle || preview.accountLabel}</strong> {preview.caption}
        </p>
      ) : null}
      {preview.hashtags.length ? <p className="saut-preview-tags">{preview.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p> : null}
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
      <div ref={dialogRef} className="saut-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="platform-preview-title" tabIndex={-1}>
        <header>
          <div>
            <strong id="platform-preview-title">{preview.platformLabel} preview</strong>
            <small>Approximate appearance · actual prepared content</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </header>
        <main>
          <PlatformPost preview={preview} handoffToken={handoffToken} />
        </main>
        <footer>
          <button type="button" className="saut-btn saut-btn-ghost" onClick={onClose}>
            Back
          </button>
          <button type="button" className="saut-btn saut-btn-secondary" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="saut-btn saut-btn-primary !h-11 !px-4" onClick={onApprove}>
            {preview.shadowMode ? "Approve shadow run" : "Approve this post"}
          </button>
        </footer>
      </div>
    </div>
  );
}
