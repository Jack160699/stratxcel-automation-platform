"use client";

import { useCallback, useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

export function AuditShareDialog({
  open,
  url,
  onClose,
}: {
  open: boolean;
  url: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  const copy = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const whatsappHref = url
    ? `https://wa.me/?text=${encodeURIComponent(`Your Stratxcel Business Growth Audit is ready.\n${url}`)}`
    : "#";

  async function shareNative() {
    if (!url) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Stratxcel Business Growth Audit", url });
        setShareHint(null);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    setShareHint("Sharing from this browser isn’t available. Copy the secure link or open WhatsApp.");
  }

  return (
    <Modal open={open} onClose={onClose} title="Share your Audit">
      <p className="text-sm text-sx-text-muted">Send a secure link. It does not include workspace or order details.</p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-3 rounded-sx-sm border border-sx-border px-3 text-sm font-medium text-sx-text hover:bg-sx-surface-2"
        >
          <PlatformIcon name="whatsapp" />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex min-h-11 items-center gap-3 rounded-sx-sm border border-sx-border px-3 text-sm font-medium text-sx-text hover:bg-sx-surface-2"
        >
          <CopyIcon />
          {copied ? "Link copied" : "Copy secure link"}
        </button>
        <button
          type="button"
          onClick={() => void shareNative()}
          className="flex min-h-11 items-center gap-3 rounded-sx-sm border border-sx-border px-3 text-sm font-medium text-sx-text hover:bg-sx-surface-2"
        >
          <ShareAppsIcon />
          Other apps / Share…
        </button>
      </div>
      {shareHint && <p className="mt-3 text-xs text-sx-text-subtle">{shareHint}</p>}
    </Modal>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="6" y="6" width="9" height="9" rx="1.5" />
      <path d="M12 6V4.5A1.5 1.5 0 0010.5 3h-6A1.5 1.5 0 003 4.5v6A1.5 1.5 0 004.5 12H6" />
    </svg>
  );
}

function ShareAppsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="4.5" cy="9" r="1.6" />
      <circle cx="13.5" cy="4.5" r="1.6" />
      <circle cx="13.5" cy="13.5" r="1.6" />
      <path d="M6 8.2l5.4-3.2M6 9.8l5.4 3.2" />
    </svg>
  );
}
