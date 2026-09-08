import React from "react";

export function ConnectorHeader({
  title,
  subtitle,
  totalCount,
  connectedCount,
  attentionCount,
  onRefresh,
  refreshing = false,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  connectedCount: number;
  attentionCount: number;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 pb-6 border-b border-sx-border/60 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-sx-sans text-xl font-bold tracking-tight text-sx-text sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1 font-sx-sans text-xs sm:text-sm text-sx-text-muted">
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 self-start sm:self-auto">
        <div className="flex items-center gap-1.5 font-sx-sans text-xs text-sx-text-muted">
          <span>{totalCount} total</span>
          <span className="text-sx-text-subtle">·</span>
          <span className="text-[#5BDCA7] font-medium">{connectedCount} connected</span>
          {attentionCount > 0 && (
            <>
              <span className="text-sx-text-subtle">·</span>
              <span className="text-[#F3C55C] font-medium">{attentionCount} need attention</span>
            </>
          )}
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3 transition-colors disabled:opacity-50"
            title="Refresh connectors"
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>Refresh</span>
          </button>
        )}
      </div>
    </div>
  );
}
