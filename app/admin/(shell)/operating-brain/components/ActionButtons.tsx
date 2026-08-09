"use client";

import { useState, useTransition } from "react";

/** Small pill button used for every Accept/Correct/Forget/Done/Drop style action across the page — one component instead of seven near-identical ones. */
export function ActionButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => Promise<void>;
  tone?: "neutral" | "danger" | "accent";
}) {
  const [pending, startTransition] = useTransition();
  const toneClass =
    tone === "danger"
      ? "border-[rgb(242_86_95_/_0.32)] text-[#FF8A90] hover:bg-[rgb(242_86_95_/_0.08)]"
      : tone === "accent"
        ? "border-[rgb(58_160_255_/_0.28)] text-[#7CC2FF] hover:bg-sx-accent-muted"
        : "border-sx-border text-sx-text-muted hover:bg-sx-surface-2";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(onClick)}
      className={`rounded-sx-pill border px-2.5 py-1 font-sx-mono text-[10px] uppercase tracking-[0.06em] transition disabled:opacity-50 ${toneClass}`}
    >
      {pending ? "…" : label}
    </button>
  );
}

/** Accept / Correct / Forget / Mark temporary / Mark wrong — the memory feedback set, with an inline textarea for Correct. */
export function MemoryFeedback({
  memoryId,
  onFeedback,
}: {
  memoryId: string;
  onFeedback: (memoryId: string, action: "ACCEPT" | "CORRECT" | "FORGET" | "MARK_TEMPORARY" | "MARK_WRONG", newStatement?: string) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState("");

  if (correcting) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Corrected statement…"
          className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11px] text-sx-text"
        />
        <ActionButton label="Save" tone="accent" onClick={() => onFeedback(memoryId, "CORRECT", draft).then(() => setCorrecting(false))} />
        <ActionButton label="Cancel" onClick={() => { setCorrecting(false); return Promise.resolve(); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionButton label="Accept" tone="accent" onClick={() => onFeedback(memoryId, "ACCEPT")} />
      <ActionButton label="Correct" onClick={() => { setCorrecting(true); return Promise.resolve(); }} />
      <ActionButton label="Temporary" onClick={() => onFeedback(memoryId, "MARK_TEMPORARY")} />
      <ActionButton label="Wrong" tone="danger" onClick={() => onFeedback(memoryId, "MARK_WRONG")} />
      <ActionButton label="Forget" tone="danger" onClick={() => onFeedback(memoryId, "FORGET")} />
    </div>
  );
}
