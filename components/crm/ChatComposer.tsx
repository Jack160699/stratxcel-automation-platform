"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/Button";

/**
 * Sticky bottom composer. Sends through the one existing shared outbound
 * route (POST /api/platform/whatsapp/send -> sendOutboundWhatsAppMessage) —
 * no second send implementation. `enabled=false` renders a disabled input
 * with the exact residual-item explanation rather than hiding the composer
 * or breaking the page (per the manual-send-readiness fallback) — inbound
 * and automatic-reply traffic keeps rendering either way.
 */
export function ChatComposer({
  enabled,
  disabledReason,
  sending,
  onSend,
}: {
  enabled: boolean;
  disabledReason?: string;
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const ok = await onSend(trimmed);
    if (ok) setText("");
  }

  if (!enabled) {
    // Compact, composer-shaped disabled state — same row height and layout
    // as the real composer below, so the footer reads as "sending is
    // intentionally off" rather than an empty/unfinished area.
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-sx-border bg-sx-surface-1 px-4 py-2.5">
        <div className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-sx-md border border-sx-border bg-sx-surface-2 px-3 text-[13px] text-sx-text-subtle">
          <LockIcon />
          <span className="truncate">{disabledReason ?? "Manual sending is not configured for this deployment."}</span>
        </div>
        <IconButton label="Send message" disabled className="h-[38px] w-[38px] shrink-0">
          <SendIcon />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-sx-border bg-sx-surface-1 px-4 py-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type a message…"
        rows={1}
        disabled={sending}
        className="max-h-32 min-h-[38px] flex-1 resize-none rounded-sx-md border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-[14.5px] text-sx-text placeholder:text-sx-text-subtle outline-none focus-visible:border-sx-accent disabled:cursor-not-allowed disabled:opacity-60"
      />
      <IconButton label="Send message" onClick={submit} disabled={sending || !text.trim()} className="h-[38px] w-[38px] shrink-0 border-sx-accent bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]">
        <SendIcon />
      </IconButton>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 9L15.5 3l-4 12-3-5-5.5-1Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0">
      <rect x="4" y="8" width="10" height="7" rx="1.5" />
      <path d="M6 8V5.5a3 3 0 016 0V8" />
    </svg>
  );
}
