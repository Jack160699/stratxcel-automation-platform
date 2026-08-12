import type { ReactNode } from "react";

export function DemoBrowserFrame({
  children,
  url = "app.stratxcel.in/workspace",
  className = "",
}: {
  children: ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 shadow-[0_24px_80px_-32px_rgba(10,16,32,0.22)] ${className}`}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-sx-border bg-sx-surface-2 px-3 py-2.5 sm:px-4">
        <span className="h-2 w-2 rounded-full bg-sx-danger/70" />
        <span className="h-2 w-2 rounded-full bg-sx-warning/80" />
        <span className="h-2 w-2 rounded-full bg-sx-success/80" />
        <span className="ml-1 hidden min-w-0 flex-1 truncate rounded-sx-sm border border-sx-border bg-sx-bg/60 px-2.5 py-1 font-sx-mono text-[10px] text-sx-text-subtle sm:block">
          {url}
        </span>
        <span className="ml-auto font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle sm:ml-0">
          Product preview
        </span>
      </div>
      {children}
    </div>
  );
}
