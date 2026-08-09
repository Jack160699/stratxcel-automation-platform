"use client";

import { useState } from "react";

export function VoiceNoteUploader() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setMessage(null);
    const formData = new FormData();
    formData.append("audio", file);
    const res = await fetch("/api/admin/operating-brain/voice-notes/upload", { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.transcribed) {
      setStatus("done");
      setMessage("Transcribed and processed.");
      window.location.reload();
    } else if (res.status === 202) {
      setStatus("error");
      setMessage(body.error ?? "Uploaded, transcription failed — retry later.");
    } else {
      setStatus("error");
      setMessage(body.error ?? `Upload failed (HTTP ${res.status})`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        disabled={status === "uploading"}
        className="text-[11px] text-sx-text-muted file:mr-2 file:rounded-sx-pill file:border file:border-sx-border file:bg-sx-surface-2 file:px-2.5 file:py-1 file:font-sx-mono file:text-[10px] file:uppercase file:tracking-[0.06em] file:text-sx-text"
      />
      {status === "uploading" && <span className="text-[10.5px] text-sx-text-muted">Uploading + transcribing…</span>}
      {message && <span className={`text-[10.5px] ${status === "error" ? "text-[#FF8A90]" : "text-[#5BDCA7]"}`}>{message}</span>}
    </div>
  );
}
