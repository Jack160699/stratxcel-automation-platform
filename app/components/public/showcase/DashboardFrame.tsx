import type { ReactNode } from "react";
import { DEMO_BUSINESS } from "./fixtures/showcase-data";

const NAV_ITEMS = [
  "Command Center",
  "Business Growth Audit",
  "Leads & CRM",
  "Brand Brain",
  "Billing",
];

export function DashboardFrame({
  children,
  activeNav = "Command Center",
  title,
}: {
  children: ReactNode;
  activeNav?: string;
  title?: string;
}) {
  return (
    <div className="flex min-h-[280px] sm:min-h-[340px]">
      <aside className="hidden w-[30%] max-w-[11rem] shrink-0 border-r border-sx-border bg-sx-surface-2/60 p-3 sm:block lg:max-w-[12.5rem] lg:p-4">
        <p className="truncate font-sx-sans text-[11px] font-semibold text-sx-text">{DEMO_BUSINESS.name}</p>
        <p className="mt-0.5 font-sx-mono text-[9px] uppercase tracking-[0.12em] text-sx-text-subtle">Workspace</p>
        <ul className="mt-4 space-y-1">
          {NAV_ITEMS.map((label) => (
            <li
              key={label}
              className={`rounded-sx-sm px-2 py-1.5 font-sx-sans text-[10.5px] font-medium leading-tight ${
                label === activeNav ? "bg-sx-accent-muted text-sx-accent" : "text-sx-text-muted"
              }`}
            >
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-sx-border bg-sx-surface-2/40 px-3 py-2 sm:px-4">
          <p className="font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle">{title ?? activeNav}</p>
        </div>
        <div className="flex-1 overflow-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}
