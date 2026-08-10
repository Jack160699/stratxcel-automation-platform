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

export function PrivateMedia({ assetId, mimeType, alt = "Attached media", controls = false }: { assetId: string; mimeType: string; alt?: string; controls?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolvedMimeType, setResolvedMimeType] = useState(mimeType);
  useEffect(() => {
    let active = true;
    fetch(`/api/social/copilot/media-preview?assetId=${encodeURIComponent(assetId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result?.url) { setUrl(result.url); setResolvedMimeType(result.mimeType || mimeType); } })
      .catch(() => {});
    return () => { active = false; };
  }, [assetId, mimeType]);
  if (!url) return <span className="saut-media-skeleton" aria-label="Loading media preview" />;
  if (resolvedMimeType.startsWith("video/")) return <video src={url} className="saut-attachment-media" controls={controls} muted={!controls} playsInline />;
  return <img src={url} alt={alt} className="saut-attachment-media" />;
}

export function AttachmentCard({ attachment }: { attachment: AgentAttachmentData }) {
  const visual = attachment.mediaAssetId && (attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/"));
  return (
    <article className={`saut-file-card${visual ? " saut-file-card-visual" : ""}`}>
      {visual ? <PrivateMedia assetId={attachment.mediaAssetId!} mimeType={attachment.mimeType} alt={attachment.name} controls={attachment.mimeType.startsWith("video/")} /> : <span className="saut-file-icon" aria-hidden>{humanFileType(attachment.mimeType).slice(0, 3).toUpperCase()}</span>}
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">{attachment.name}</strong>
        <span className="text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>{humanFileType(attachment.mimeType)} · {humanFileSize(attachment.sizeBytes)} · {statusLabel(attachment.processingStatus)}</span>
      </span>
    </article>
  );
}
