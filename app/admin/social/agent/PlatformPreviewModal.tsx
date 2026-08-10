"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PrivateMedia } from "./AttachmentMedia";

function Profile({ preview }: { preview: PublishActionPreview }) {
  return <div className="saut-preview-profile">
    {preview.accountAvatarUrl ? <img src={preview.accountAvatarUrl} alt="" /> : <span aria-hidden>{(preview.accountLabel || "S").slice(0, 1).toUpperCase()}</span>}
    <div><strong>{preview.accountLabel || "Connected profile"}</strong><small>{preview.accountHandle ? `@${preview.accountHandle.replace(/^@/, "")}` : "Connected account"}</small></div>
  </div>;
}

function MediaCarousel({ preview }: { preview: PublishActionPreview }) {
  const [index, setIndex] = useState(0);
  const assets = preview.mediaAssetIds;
  if (!assets.length) return null;
  return <div className="saut-preview-carousel">
    <PrivateMedia assetId={assets[index]} mimeType={preview.platform === "youtube" ? "video/mp4" : "image/jpeg"} alt={`Post media ${index + 1} of ${assets.length}`} controls={preview.platform === "youtube"} />
    {assets.length > 1 ? <>
      <button className="saut-carousel-prev" onClick={() => setIndex((index - 1 + assets.length) % assets.length)} aria-label="Previous image">‹</button>
      <button className="saut-carousel-next" onClick={() => setIndex((index + 1) % assets.length)} aria-label="Next image">›</button>
      <span className="saut-carousel-count">{index + 1}/{assets.length}</span>
    </> : null}
  </div>;
}

function PlatformPost({ preview }: { preview: PublishActionPreview }) {
  const platform = preview.platform?.toLowerCase() || "other";
  const actions = platform === "linkedin" ? "Like   Comment   Repost   Send" : platform === "facebook" ? "Like   Comment   Share" : platform === "threads" ? "♡   Reply   Repost   Share" : platform === "youtube" ? "Like   Share   Save" : "♡   Comment   Share   Save";
  return <article className={`saut-platform-preview saut-platform-${platform}`}>
    <Profile preview={preview} />
    {platform === "linkedin" || platform === "facebook" || platform === "threads" ? <p className="saut-preview-copy">{preview.caption}</p> : null}
    <MediaCarousel preview={preview} />
    {platform === "instagram" || platform === "youtube" ? <p className="saut-preview-copy"><strong>{preview.accountHandle || preview.accountLabel}</strong> {preview.caption}</p> : null}
    {preview.hashtags.length ? <p className="saut-preview-tags">{preview.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p> : null}
    <div className="saut-preview-actions" aria-hidden>{actions}</div>
  </article>;
}

export function PlatformPreviewModal({ preview, onClose, onEdit, onApprove }: { preview: PublishActionPreview; onClose: () => void; onEdit: () => void; onApprove: () => void }) {
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
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="saut-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="saut-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="platform-preview-title" tabIndex={-1}>
      <header><div><strong id="platform-preview-title">{preview.platformLabel} preview</strong><small>Approximate appearance · actual prepared content</small></div><button onClick={onClose} aria-label="Close preview">×</button></header>
      <main><PlatformPost preview={preview} /></main>
      <footer><button className="saut-btn saut-btn-ghost" onClick={onClose}>Back</button><button className="saut-btn saut-btn-secondary" onClick={onEdit}>Edit</button><button className="saut-btn saut-btn-primary" onClick={onApprove}>{preview.shadowMode ? "Approve shadow run" : "Approve this platform"}</button></footer>
    </div>
  </div>;
}
