"use client";

import type { ReactNode } from "react";
import { Eye } from "lucide-react";

export function AdminEntityRow({
  icon,
  title,
  subtitle,
  status,
  timestamp,
  meta,
  primaryAction,
  onOpenDetails,
  detailsAriaLabel = "View details",
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  timestamp?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  onOpenDetails?: () => void;
  detailsAriaLabel?: string;
  className?: string;
}) {
  return (
    <div
      onClick={onOpenDetails}
      className={`group relative flex flex-wrap items-center justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1/70 px-4 py-3 transition-all duration-150 hover:border-sx-border-strong hover:bg-sx-surface-1 cursor-pointer sm:flex-nowrap ${className}`}
    >
      {/* Left: Icon + Title + 1-line Subtitle */}
      <div className="flex min-w-0 items-center gap-3.5 flex-1">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-2 text-sx-text shadow-sm transition-colors group-hover:border-sx-border">
            {icon}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-sx-text group-hover:text-sx-accent transition-colors">
              {title}
            </span>
            {meta}
          </div>
          {subtitle && (
            <span className="truncate text-[12px] text-sx-text-muted leading-tight">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right: Status + Timestamp + Primary Action + Eye */}
      <div
        className="flex shrink-0 items-center gap-3 ml-auto"
        onClick={(e) => {
          // Allow clicking actions inside without triggering row click twice
          if ((e.target as HTMLElement).closest("button, a")) {
            e.stopPropagation();
          }
        }}
      >
        {timestamp && (
          <span className="hidden text-[11px] font-sx-mono text-sx-text-subtle md:inline">
            {timestamp}
          </span>
        )}
        {status && <div className="shrink-0">{status}</div>}
        {primaryAction && <div className="shrink-0">{primaryAction}</div>}
        {onOpenDetails && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
            aria-label={detailsAriaLabel}
            title={detailsAriaLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-2 text-sx-text-muted transition-colors hover:border-sx-border-strong hover:bg-sx-surface-1 hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent"
          >
            <Eye size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
