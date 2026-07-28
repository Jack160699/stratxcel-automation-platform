"use client";

import { useCopilot, sessionStatusLabel } from "./CopilotContext";

export function MinimizedButton() {
  const { sessionStatus, openMostRecent } = useCopilot();
  const { label, tone } = sessionStatusLabel(sessionStatus);
  const showChip = tone !== "idle";

  const dotColor =
    tone === "working"
      ? "var(--saut-ai)"
      : tone === "waiting"
        ? "var(--saut-warning)"
        : tone === "failed"
          ? "var(--saut-danger)"
          : "var(--saut-success)";

  return (
    <button
      onClick={openMostRecent}
      aria-label={`Open Stratxcel Copilot${showChip ? ` — ${label}` : ""}`}
      className="saut-copilot-fab fixed z-40 flex items-center gap-2 rounded-full shadow-lg transition hover:brightness-110"
      style={{ background: "var(--saut-accent)", color: "var(--saut-accent-on)" }}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full saut-pulse" style={{ background: dotColor }} aria-hidden />
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="2.6" />
          <circle cx="10" cy="10" r="7" />
        </svg>
      </span>
      {showChip && <span className="saut-mono pr-3.5 text-[11px] uppercase tracking-wide">Copilot · {label}</span>}
    </button>
  );
}
