/**
 * Abstract platform shell for the homepage hero — structural UI only, no fabricated metrics.
 */
const MODULES = [
  { label: "Research", active: false },
  { label: "Content", active: true },
  { label: "Search", active: false },
  { label: "CRM", active: false },
  { label: "WhatsApp", active: false },
];

const PANELS = [
  { title: "Content pipeline", status: "Draft ready for review", tone: "accent" as const },
  { title: "Lead inbox", status: "New inquiry assigned", tone: "muted" as const },
  { title: "Search signals", status: "Weekly summary prepared", tone: "muted" as const },
];

export function PlatformPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[min(100%,42rem)] overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 shadow-[0_24px_80px_-32px_rgba(10,16,32,0.22)]"
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-sx-border bg-sx-surface-2 px-3 py-2.5 sm:px-4">
        <span className="h-2 w-2 rounded-full bg-sx-danger/70" />
        <span className="h-2 w-2 rounded-full bg-sx-warning/80" />
        <span className="h-2 w-2 rounded-full bg-sx-success/80" />
        <span className="ml-2 font-sx-mono text-[10px] uppercase tracking-[0.14em] text-sx-text-subtle">
          Stratxcel workspace
        </span>
      </div>

      <div className="flex min-h-[180px] sm:min-h-[240px]">
        <aside className="hidden w-[34%] shrink-0 border-r border-sx-border bg-sx-surface-2/60 p-3 sm:block sm:p-4">
          <p className="font-sx-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-sx-text-subtle">
            Modules
          </p>
          <ul className="mt-3 space-y-1.5">
            {MODULES.map((mod) => (
              <li
                key={mod.label}
                className={`rounded-sx-sm px-2.5 py-1.5 font-sx-sans text-[11px] font-medium ${
                  mod.active
                    ? "bg-sx-accent-muted text-sx-accent"
                    : "text-sx-text-muted"
                }`}
              >
                {mod.label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {MODULES.map((mod) => (
              <span
                key={`tab-${mod.label}`}
                className={`rounded-sx-pill px-2.5 py-1 font-sx-sans text-[10px] font-semibold sm:hidden ${
                  mod.active
                    ? "bg-sx-accent-muted text-sx-accent"
                    : "border border-sx-border text-sx-text-muted"
                }`}
              >
                {mod.label}
              </span>
            ))}
          </div>

          <div className="mt-2 space-y-2 sm:mt-0">
            {PANELS.map((panel, index) => (
              <div
                key={panel.title}
                className={`rounded-sx-sm border border-sx-border bg-sx-bg/40 px-3 py-2.5 ${index === 2 ? "hidden sm:block" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-sx-sans text-[12px] font-semibold text-sx-text">{panel.title}</p>
                  <span
                    className={`shrink-0 rounded-sx-pill px-2 py-0.5 font-sx-mono text-[9px] font-semibold uppercase tracking-wide ${
                      panel.tone === "accent"
                        ? "bg-sx-accent-muted text-sx-accent"
                        : "bg-sx-surface-3 text-sx-text-subtle"
                    }`}
                  >
                    {panel.tone === "accent" ? "Review" : "Update"}
                  </span>
                </div>
                <p className="mt-1 font-sx-sans text-[11px] text-sx-text-muted">{panel.status}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto hidden pt-4 sm:block">
            <div className="h-1.5 w-full overflow-hidden rounded-sx-pill bg-sx-surface-3">
              <div className="h-full w-[62%] rounded-sx-pill bg-gradient-to-r from-sx-accent to-sx-royal" />
            </div>
            <p className="mt-2 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle">
              Growth workflow in progress
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
