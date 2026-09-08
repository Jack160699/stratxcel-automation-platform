"use client";

import type { ReactNode } from "react";

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sx-md border border-dashed border-sx-border/80 bg-sx-surface-1/40 px-6 py-12 text-center">
      {icon && (
        <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl border border-sx-border/60 bg-sx-surface-2 text-sx-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-sx-text">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-sx-text-muted max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
