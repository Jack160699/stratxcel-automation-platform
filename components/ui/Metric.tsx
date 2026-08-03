import type { ReactNode } from "react";

type Delta = "up" | "down" | "neutral";
const DELTA_CLASSES: Record<Delta, string> = {
  up: "text-[#5BDCA7]",
  down: "text-[#FF8A90]",
  neutral: "text-sx-text-subtle",
};

/**
 * Metric card — number first (mono, tabular-nums), label above, delta below
 * with a stated comparison window. Never fabricate a delta for an unknown
 * comparison — pass deltaLabel="—" rather than omitting it silently.
 * docs/product-design/DESIGN_SOURCE_AUDIT.md §2.10.
 */
export function Metric({
  label,
  value,
  delta,
  deltaLabel,
  ai = false,
}: {
  label: string;
  value: ReactNode;
  delta?: Delta;
  deltaLabel?: string;
  ai?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-sx-md border p-3.5 ${
        ai
          ? "border-[rgb(79_220_229_/_0.22)] bg-gradient-to-br from-[rgb(79_220_229_/_0.07)] to-transparent bg-sx-surface-1"
          : "border-sx-border bg-sx-surface-1"
      }`}
    >
      <span className={`text-[10.5px] font-medium uppercase tracking-[0.09em] ${ai ? "text-[#7FE7EE]" : "text-sx-text-muted"}`}>
        {label}
      </span>
      <span className="font-sx-mono text-2xl font-medium leading-none tracking-[-0.02em] tabular-nums text-sx-text">{value}</span>
      {deltaLabel && (
        <span className={`font-sx-mono text-[10.5px] ${delta ? DELTA_CLASSES[delta] : "text-sx-text-subtle"}`}>{deltaLabel}</span>
      )}
    </div>
  );
}

/** Small count/label badge — distinct from StatusChip, which always carries state semantics. */
export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-sx-xs bg-sx-surface-3 px-1.5 py-0.5 font-sx-mono text-[10px] text-sx-text-subtle ${className}`}>
      {children}
    </span>
  );
}
