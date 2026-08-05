/**
 * Metric-tile counterpart to components/ui/Metric.tsx's Metric, for values
 * that genuinely cannot be calculated yet. Renders "—" with the reason —
 * never a fabricated 0 or invented percentage (per the Reports honesty
 * rule: a missing metric is not the same as a zero metric).
 */
export function MetricUnavailable({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-sx-md border border-dashed border-sx-border-strong bg-sx-surface-1 p-3.5">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-sx-text-muted">{label}</span>
      <span className="font-sx-mono text-2xl font-medium leading-none tracking-[-0.02em] text-sx-text-subtle">Not available</span>
      <span className="text-[10.5px] text-sx-text-subtle">{reason}</span>
    </div>
  );
}
