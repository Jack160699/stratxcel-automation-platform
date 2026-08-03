export interface RailStage {
  label: string;
  status: "done" | "active" | "future";
}

const DOT_CLASSES: Record<RailStage["status"], string> = {
  done: "bg-sx-success",
  active: "bg-sx-ai shadow-[0_0_0_4px_rgb(79_220_229_/_0.14)]",
  future: "bg-sx-border-strong",
};

/** Mission/onboarding progress — docs/product-design/DESIGN_SOURCE_AUDIT.md §2.7. */
export function WorkflowRail({ stages }: { stages: RailStage[] }) {
  return (
    <div>
      <div className="flex items-center">
        {stages.map((s, i) => (
          <span key={s.label} className="flex flex-1 items-center last:flex-none">
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[s.status]}`} />
            {i < stages.length - 1 && (
              <span className={`h-px flex-1 ${s.status === "done" ? "bg-sx-success opacity-50" : "bg-sx-border-strong"}`} />
            )}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-sx-mono text-[8.5px] uppercase tracking-[0.06em] text-sx-text-subtle">
        {stages.map((s) => (
          <span key={s.label} className={s.status === "active" ? "text-sx-ai" : ""}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 5-segment confidence bar — below 0.60 requires review before the card can act (DESIGN_SOURCE_AUDIT.md §2.7). */
export function ConfidenceBar({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  const needsReview = value < 0.6;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-[3px]">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-sm ${i < filled ? "bg-sx-ai" : "bg-sx-elevated"}`} />
        ))}
      </div>
      <span className={`font-sx-mono text-[11px] ${needsReview ? "text-[#F3C55C]" : "text-sx-text-subtle"}`}>
        {value.toFixed(2)}
        {needsReview && " · needs review"}
      </span>
    </div>
  );
}
