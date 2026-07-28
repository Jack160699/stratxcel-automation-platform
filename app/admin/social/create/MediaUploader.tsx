"use client";

import { useRef, useState } from "react";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";
import { validateMediaMetadata } from "@/lib/social/media-validation";

interface UploadedMedia {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

function humanSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaUploader({ onUploadingChange }: { onUploadingChange: (uploading: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    const validationError = validateMediaMetadata({ name: file.name, mimeType: file.type, sizeBytes: file.size });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (media && !(await remove())) return;
    setProgress(0);
    onUploadingChange(true);
    let pendingId: string | null = null;
    try {
      const preparedResponse = await fetch("/api/social/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", name: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error ?? "Could not prepare media upload");
      pendingId = prepared.asset.id as string;
      await uploadToSignedUrlWithProgress(prepared.signedUrl as string, file, setProgress);
      const finalizedResponse = await fetch("/api/social/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", assetId: pendingId }),
      });
      const finalized = await finalizedResponse.json();
      if (!finalizedResponse.ok) throw new Error(finalized.error ?? "Could not finalize media upload");
      setMedia({ id: finalized.asset.id, name: finalized.asset.original_name, mimeType: finalized.asset.mime_type, sizeBytes: finalized.asset.size_bytes });
    } catch (uploadError) {
      if (pendingId) await fetch(`/api/social/media?id=${encodeURIComponent(pendingId)}`, { method: "DELETE" });
      setError(uploadError instanceof Error ? uploadError.message : "Media upload failed");
    } finally {
      setProgress(null);
      onUploadingChange(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!media) return true;
    const response = await fetch(`/api/social/media?id=${encodeURIComponent(media.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json();
      setError(result.error ?? "Could not remove media");
      return false;
    }
    setMedia(null);
    return true;
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <input type="hidden" name="media_asset_ids" value={media?.id ?? ""} />
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".mp4,.jpg,.jpeg,.png,.webp,video/mp4,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div
        className="saut-card border border-dashed p-4 text-center text-sm"
        style={{ borderColor: dragging ? "var(--saut-accent)" : "var(--saut-border)" }}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        {media ? (
          <div className="flex items-center justify-between gap-3 text-left">
            <div className="min-w-0">
              <p className="truncate font-medium">{media.name}</p>
              <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                {media.mimeType} · {humanSize(media.sizeBytes)}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="saut-btn saut-btn-secondary" onClick={() => inputRef.current?.click()}>Replace</button>
              <button type="button" className="saut-btn saut-btn-secondary" onClick={() => void remove()}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className="w-full" onClick={() => inputRef.current?.click()}>
            <span className="font-medium">Choose or drop media</span>
            <span className="mt-1 block text-xs" style={{ color: "var(--saut-text-subtle)" }}>
              MP4 up to 100 MB · JPEG, PNG, or WebP up to 20 MB
            </span>
          </button>
        )}
        {progress !== null ? (
          <div className="mt-3" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--saut-surface-3)" }}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--saut-accent)" }} />
            </div>
            <span className="mt-1 block text-xs">{progress}% uploaded</span>
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs" style={{ color: "var(--saut-danger)" }}>{error}</p> : null}
    </div>
  );
}
