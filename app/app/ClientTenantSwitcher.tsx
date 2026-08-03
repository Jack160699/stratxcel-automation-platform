"use client";

import { useState, useRef, useEffect } from "react";
import { useCurrentTenant } from "./CurrentTenantContext";

/** /app's copy of app/admin/(shell)/ClientSwitcher.tsx, same interaction, no "create another client" link (out of scope for the client-facing switcher in this pass). */
export function ClientTenantSwitcher() {
  const { tenants, active, switching, switchTenant } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  if (tenants.length <= 1) {
    return <span className="truncate text-[13px] font-semibold text-sx-text">{active?.name ?? "Stratxcel"}</span>;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        className="flex min-h-9 min-w-0 items-center gap-2 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2.5 text-[13px] text-sx-text hover:border-sx-border-strong disabled:opacity-60"
      >
        <span className="min-w-0 max-w-[10rem] truncate font-medium">
          {switching ? "Switching…" : active ? active.name : "Select a client"}
        </span>
        <span aria-hidden className="text-sx-text-subtle">▾</span>
      </button>

      {open && (
        <div role="listbox" className="absolute left-0 z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-sx-md border border-sx-border-strong bg-sx-elevated py-1 shadow-[var(--sx-shadow-lg)]">
          {tenants.map((t) => (
            <button
              key={t.tenantId}
              role="option"
              aria-selected={active?.tenantId === t.tenantId}
              onClick={() => {
                setOpen(false);
                if (t.tenantId !== active?.tenantId) void switchTenant(t.tenantId);
              }}
              className={`flex w-full min-h-11 items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sx-surface-2 ${
                active?.tenantId === t.tenantId ? "bg-sx-surface-2 text-sx-text" : "text-sx-text-muted"
              }`}
            >
              <span className="min-w-0 truncate">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="block truncate text-xs text-sx-text-subtle">{t.role}</span>
              </span>
              {active?.tenantId === t.tenantId && <span aria-hidden className="shrink-0 text-sx-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
