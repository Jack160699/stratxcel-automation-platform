import type { ReactNode } from "react";

/**
 * Shared page header for every /app/* module — title (+ optional active
 * tenant name suffix, matching the existing missions/approvals/billing
 * pattern), optional description line, optional right-aligned actions.
 */
export function ModulePageHeader({
  title,
  tenantName,
  description,
  actions,
}: {
  title: string;
  tenantName?: string | null;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">
          {title}
          {tenantName ? ` — ${tenantName}` : ""}
        </h1>
        {description && <p className="mt-1 text-sm text-sx-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Metric-tile row wrapper — pairs with components/ui/Metric.tsx's Metric and this module's MetricUnavailable. */
export function ModuleStatusSummary({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</section>;
}
