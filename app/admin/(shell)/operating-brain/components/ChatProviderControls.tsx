"use client";

import { useRef, useState } from "react";
import { ActionButton } from "./ActionButtons";

export function ChatProviderControls({ providerKey, supportsImport }: { providerKey: string; supportsImport: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true); setFeedback(null);
    const form = new FormData(); form.set("provider", providerKey); form.set("export", file);
    const response = await fetch("/api/admin/operating-brain/chat/import", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setFeedback(body.error ?? "Import failed");
    else { setFeedback(body.duplicate ? `Already imported (${body.previousCount} messages)` : `Imported ${body.imported} messages from ${body.conversations} conversations`); window.location.reload(); }
  }
  if (!supportsImport) return <span className="font-sx-mono text-[10px] uppercase text-sx-text-subtle">Set up / auth required</span>;
  return <div className="flex flex-col items-end gap-1">
    <input ref={input} className="hidden" type="file" accept=".json,.zip,application/json,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    <ActionButton label={busy ? "Importing…" : `Import ${providerKey === "chatgpt" ? "ChatGPT" : providerKey === "claude" ? "Claude" : "export"}`} tone="accent" onClick={() => { input.current?.click(); return Promise.resolve(); }} />
    {feedback && <span className="max-w-64 text-right text-[10.5px] text-sx-text-muted">{feedback}</span>}
  </div>;
}
