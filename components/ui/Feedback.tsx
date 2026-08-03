import type { ReactNode } from "react";

/**
 * Empty state — title (what's missing) → subtitle (why / what fills it) →
 * optional action. Copy pattern: docs/product-design/CONTENT_AND_UX_VOICE.md
 * §5. Never render with fabricated sample rows instead of this.
 */
export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-sx-md border border-dashed border-sx-border-strong px-6 py-8 text-center">
      <span className="text-[13px] font-semibold text-sx-text">{title}</span>
      {subtitle && <span className="text-xs text-sx-text-muted">{subtitle}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Error state — what happened / what it affects / what to do, per
 * docs/product-design/EMPTY_LOADING_ERROR_STATE_MATRIX.md §3. `retry` is
 * omitted for non-transient failures (permission/not-found) — retrying
 * those teaches the user nothing.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sx-md border border-[rgb(242_86_95_/_0.32)] bg-[rgb(242_86_95_/_0.06)] px-3.5 py-2.5 text-[12.5px] text-[#FF8A90]" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-sx-mono text-[10.5px] uppercase tracking-[0.06em] underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Skeleton — only for content plausibly taking >400ms to load; never render
 * for sub-400ms content (design rule, DESIGN_SOURCE_AUDIT.md §2.9).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-sx-sm bg-gradient-to-r from-sx-surface-2 via-sx-elevated to-sx-surface-2 bg-[length:320px_100%] ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-t border-sx-border py-2.5 first:border-t-0">
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
