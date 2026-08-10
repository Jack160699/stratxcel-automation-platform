"use client";

import { useState } from "react";
import type { PackagePublishPreview } from "@/lib/social/package-preview";

/**
 * Deterministic platform preview for Package Autopilot — same visual
 * structure as Social Copilot's PlatformPreviewModal / PlatformPost, fed by
 * the persisted publish payload (account, caption, hashtags, ordered media).
 */
function Profile({ preview }: { preview: PackagePublishPreview }) {
  return (
    <div className="pkg-preview-profile">
      {preview.accountAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.accountAvatarUrl} alt="" />
      ) : (
        <span aria-hidden>{(preview.accountLabel || "S").slice(0, 1).toUpperCase()}</span>
      )}
      <div>
        <strong>{preview.accountLabel || "Connected profile"}</strong>
        <small>{preview.accountHandle ? `@${preview.accountHandle.replace(/^@/, "")}` : "Connected account"}</small>
      </div>
    </div>
  );
}

function MediaCarousel({ preview }: { preview: PackagePublishPreview }) {
  const [index, setIndex] = useState(0);
  const assets = preview.media;
  if (!assets.length) return null;
  const current = assets[index];
  return (
    <div className="pkg-preview-carousel">
      {current.mimeType.startsWith("video/") ? (
        <video src={current.url} className="pkg-preview-media" controls playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.url} alt={`Post media ${index + 1} of ${assets.length}`} className="pkg-preview-media" />
      )}
      {assets.length > 1 ? (
        <>
          <button type="button" className="pkg-carousel-prev" onClick={() => setIndex((index - 1 + assets.length) % assets.length)} aria-label="Previous image">
            ‹
          </button>
          <button type="button" className="pkg-carousel-next" onClick={() => setIndex((index + 1) % assets.length)} aria-label="Next image">
            ›
          </button>
          <span className="pkg-carousel-count">
            {index + 1}/{assets.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function PackagePublishPreviewCard({ preview, onClose }: { preview: PackagePublishPreview; onClose: () => void }) {
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
    <div className="pkg-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pkg-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="package-preview-title">
        <header>
          <div>
            <strong id="package-preview-title">{preview.platformLabel ?? "Post"} preview</strong>
            <small>Approximate appearance · actual prepared publish payload</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </header>
        <main>
          <article className={`pkg-platform-preview pkg-platform-${platform}`}>
            <Profile preview={preview} />
            {platform === "linkedin" || platform === "facebook" || platform === "threads" ? <p className="pkg-preview-copy">{preview.caption}</p> : null}
            <MediaCarousel preview={preview} />
            {platform === "instagram" || platform === "youtube" || (!["linkedin", "facebook", "threads"].includes(platform)) ? (
              <p className="pkg-preview-copy">
                <strong>{preview.accountHandle || preview.accountLabel}</strong> {preview.caption}
              </p>
            ) : null}
            {preview.hashtags.length ? <p className="pkg-preview-tags">{preview.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p> : null}
            <div className="pkg-preview-actions" aria-hidden>
              {actions}
            </div>
          </article>
        </main>
        <footer>
          <button type="button" className="rounded-sx-sm border border-sx-border px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
      <style>{`
        .pkg-preview-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgb(2 7 14 / 0.78);
          backdrop-filter: blur(5px);
        }
        .pkg-preview-dialog {
          display: flex;
          width: min(620px, 100%);
          max-height: min(840px, calc(100dvh - 32px));
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--sx-border, #2a3140);
          border-radius: 18px;
          background: var(--sx-surface-1, #0f131a);
          box-shadow: 0 28px 80px rgb(0 0 0 / 0.5);
          color: var(--sx-text, #e8ecf5);
        }
        .pkg-preview-dialog > header,
        .pkg-preview-dialog > footer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
        }
        .pkg-preview-dialog > header {
          justify-content: space-between;
          border-bottom: 1px solid var(--sx-border, #2a3140);
        }
        .pkg-preview-dialog > header small {
          display: block;
          color: var(--sx-text-subtle, #8b93a7);
          font-size: 10px;
        }
        .pkg-preview-dialog > header button {
          font-size: 24px;
          color: var(--sx-text-muted, #a7b0c3);
        }
        .pkg-preview-dialog > main {
          overflow-y: auto;
          padding: 20px;
        }
        .pkg-preview-dialog > footer {
          justify-content: flex-end;
          border-top: 1px solid var(--sx-border, #2a3140);
        }
        .pkg-platform-preview {
          width: min(470px, 100%);
          margin: auto;
          overflow: hidden;
          border: 1px solid #d7dde8;
          border-radius: 13px;
          background: #fff;
          color: #151515;
        }
        .pkg-preview-profile {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px;
        }
        .pkg-preview-profile > img,
        .pkg-preview-profile > span {
          display: inline-flex;
          width: 38px;
          height: 38px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          object-fit: cover;
          background: #e8edf4;
          font-weight: 700;
        }
        .pkg-preview-profile strong,
        .pkg-preview-profile small {
          display: block;
        }
        .pkg-preview-profile small {
          color: #68717d;
          font-size: 10px;
        }
        .pkg-preview-copy,
        .pkg-preview-tags {
          padding: 0 12px 12px;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.45;
        }
        .pkg-preview-tags {
          color: #1769aa;
        }
        .pkg-preview-carousel {
          position: relative;
          background: #eef1f4;
        }
        .pkg-preview-media {
          display: block;
          width: 100%;
          max-height: 520px;
          object-fit: contain;
        }
        .pkg-carousel-prev,
        .pkg-carousel-next {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          border-radius: 999px;
          background: rgb(255 255 255 / 0.9);
          border: 1px solid #c9d0db;
        }
        .pkg-carousel-prev {
          left: 8px;
        }
        .pkg-carousel-next {
          right: 8px;
        }
        .pkg-carousel-count {
          position: absolute;
          right: 10px;
          bottom: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgb(0 0 0 / 0.55);
          color: #fff;
          font-size: 11px;
        }
        .pkg-preview-actions {
          padding: 0 12px 12px;
          color: #68717d;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
