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
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-sx-border bg-sx-surface-1 px-4 py-3">
        <p className="text-xs text-sx-text-subtle">{disabledReason ?? "Manual sending is not configured for this deployment."}</p>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-sx-border bg-sx-surface-1 px-4 py-3">
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
