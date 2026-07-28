import { Mark } from "@/app/components/Mark";

/** Left-side brand experience for the Command Center auth shell. Desktop only — pure CSS, no JS/canvas cost. */
export function CommandCenterBrandPanel() {
  return (
    <div className="saut-auth-brand">
      <div className="saut-auth-grid" aria-hidden="true" />
      <div
        className="saut-auth-orbit"
        aria-hidden="true"
        style={{ width: 560, height: 560, left: -140, top: "50%", marginTop: -280 }}
      />
      <div
        className="saut-auth-orbit"
        aria-hidden="true"
        style={{ width: 380, height: 380, left: -50, top: "50%", marginTop: -190 }}
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <Mark className="h-9 w-9" />
          <span className="saut-mono text-[12px] uppercase tracking-[0.35em]" style={{ color: "var(--saut-text-muted)" }}>
            Stratxcel
          </span>
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.03em]" style={{ color: "var(--saut-text)" }}>
          Command Center
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "var(--saut-text-muted)" }}>
          Secure access to your operating system.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          <span className="saut-chip saut-chip-success">
            <span className="saut-chip-dot saut-pulse" />
            Systems online
          </span>
          <span className="saut-chip saut-chip-info">
            <span className="saut-chip-dot" />
            Secure session
          </span>
          <span className="saut-chip saut-chip-neutral">
            <span className="saut-chip-dot" />
            Production
          </span>
        </div>
      </div>
    </div>
  );
}
