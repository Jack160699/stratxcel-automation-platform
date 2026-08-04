/** Horizontal numbered stage list on Core tokens — dark-theme counterpart of the old PipelineRail. */
export function StageRail({ stages, className = "" }: { stages: string[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-6 ${className}`.trim()}>
      {stages.map((label, i) => (
        <div key={label} className="flex items-center gap-2.5 sm:flex-1 sm:min-w-[7rem] sm:flex-col sm:items-center sm:text-center">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sx-accent/40 bg-sx-accent-muted font-sx-mono text-[10px] font-semibold text-sx-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <p className="font-sx-sans text-[12.5px] leading-snug text-sx-text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}
