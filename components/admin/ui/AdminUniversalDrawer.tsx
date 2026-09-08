"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface AdminUniversalDrawerProps {
  open: boolean;
  onClose: () => void;
  entityType?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  statusBadge?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function AdminUniversalDrawer({
  open,
  onClose,
  entityType,
  title,
  subtitle,
  icon,
  statusBadge,
  children,
  actions,
}: AdminUniversalDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--sx-z-sheet,60)] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[rgb(4_6_10_/_0.65)] backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full flex-col border-l border-sx-border bg-sx-surface-1 shadow-2xl transition-transform duration-200 sm:w-[500px] lg:w-[560px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-sx-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-3.5 flex-1">
            {icon && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sx-border/80 bg-sx-surface-2 text-sx-text shadow-sm">
                {icon}
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              {entityType && (
                <span className="font-sx-mono text-[10px] uppercase tracking-[0.14em] text-sx-text-subtle">
                  {entityType}
                </span>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-semibold tracking-tight text-sx-text truncate">{title}</h2>
                {statusBadge}
              </div>
              {subtitle && <p className="text-xs text-sx-text-muted leading-relaxed line-clamp-2">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sx-border/60 bg-sx-surface-2 text-sx-text-muted transition-colors hover:border-sx-border hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="sx-thin-scroll flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">{children}</div>
        </div>

        {/* Footer Actions */}
        {actions && (
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-sx-border bg-sx-surface-1/90 px-6 py-4 backdrop-blur-sm">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminDrawerSection({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-sx-md border border-sx-border/60 bg-sx-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-sx-text-muted">{title}</h3>
          {subtitle && <p className="text-[11px] text-sx-text-subtle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="text-xs text-sx-text">{children}</div>
    </div>
  );
}

export function AdminDrawerRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-sx-border/40 last:border-0">
      <span className="text-sx-text-muted shrink-0">{label}</span>
      <span className={`text-right text-sx-text truncate ${mono ? "font-sx-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}
