"use client";
import { useState } from "react";
import type { PublishActionPreview } from "@/lib/social/agent/action-preview";
import { PlatformPreviewModal } from "@/app/admin/(shell)/social/agent/PlatformPreviewModal";
import { PrivateMedia } from "@/app/admin/(shell)/social/agent/AttachmentMedia";

export function WhatsAppSocialReview({ previews: initialPreviews, handoffToken, approveToken, editToken, cancelToken }: { previews: PublishActionPreview[]; handoffToken: string; approveToken: string; editToken: string; cancelToken: string }) {
  const [previews, setPreviews] = useState(initialPreviews);
  const [opened, setOpened] = useState<PublishActionPreview | null>(null);
  const [status, setStatus] = useState("");
  const decide = async (operation: "approve" | "cancel") => {
    const response = await fetch("/api/social/copilot/whatsapp-web-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: operation === "approve" ? approveToken : cancelToken, operation }) });
    const result = await response.json();
    setStatus(result.text || result.error || "Done");
  };
  const edit = async (preview: PublishActionPreview) => {
    const caption = window.prompt(`Edit ${preview.platformLabel || "post"} caption`, preview.caption || "");
    if (caption === null) return;
    const response = await fetch("/api/social/copilot/whatsapp-web-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: editToken, operation: "edit", actionId: preview.actionId, caption }) });
    const result = await response.json();
    if (!response.ok || !result.preview) { setStatus(result.error || "Could not save this edit."); return; }
    setPreviews((current) => current.map((item) => item.actionId === result.preview.actionId ? result.preview : item));
    setOpened(result.preview);
    setStatus("Edit saved. The approval now uses this version.");
  };
  return <main className="mx-auto w-full max-w-4xl lg:max-w-5xl p-4 sm:p-6 lg:p-8 text-sx-text">
    <p className="text-xs uppercase tracking-widest text-sx-text-subtle">Social Copilot · WhatsApp mission</p>
    <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-sx-text">Ready for review</h1>
    <p className="mt-1 text-sm text-sx-text-subtle">{previews.length} prepared platform post{previews.length === 1 ? "" : "s"}</p>
    <div className={`mt-6 ${previews.length > 1 ? "grid gap-4 sm:grid-cols-2" : "space-y-3"}`}>{previews.map((preview) => <article key={preview.actionId} className="rounded-xl border border-sx-border bg-sx-surface-1 p-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-3"><div><strong className="text-sx-text">{preview.platformLabel}</strong><small className="ml-2 text-sx-success">Recommended</small></div><button className="rounded-lg border border-sx-border px-3 py-1.5 text-sm text-sx-text hover:bg-sx-surface-2" onClick={() => setOpened(preview)}>Preview</button></div>
        {preview.mediaAssetIds[0] ? <div className="mt-3 max-w-sm"><PrivateMedia assetId={preview.mediaAssetIds[0]} mimeType="image/jpeg" handoffToken={handoffToken} /></div> : null}
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-sx-text-muted">{preview.caption}</p>
      </div>
    </article>)}</div>
    {status ? <p className="mt-4 rounded-lg bg-sx-surface-2 p-3 text-sm text-sx-text" role="status">{status}</p> : null}
    <div className="sticky bottom-3 mt-6 flex justify-end gap-2 rounded-xl border border-sx-border bg-sx-elevated/95 p-3 shadow-lg"><button className="rounded-lg px-4 py-2 text-sx-text-muted hover:text-sx-text" onClick={() => void decide("cancel")}>Cancel</button><button className="rounded-lg bg-sx-accent px-4 py-2 text-sx-accent-on" onClick={() => void decide("approve")}>Approve selected &amp; publish</button></div>
    {opened ? <PlatformPreviewModal preview={opened} handoffToken={handoffToken} onClose={() => setOpened(null)} onEdit={() => void edit(opened)} onApprove={() => void decide("approve")} /> : null}
  </main>;
}
