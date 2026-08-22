"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useCurrentTenant } from "./CurrentTenantContext";

/**
 * Brand & Workspace Selector in the customer top header.
 * Provides instant access to the canonical Brand/Business Center (/app/brand)
 * and allows seamless switching when multiple client workspaces exist.
 */
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

  const businessName = active?.name ?? "Your Business";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        aria-label={`Current brand: ${businessName}. Open brand menu`}
        className="flex min-h-9 min-w-0 items-center gap-1.5 sm:gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 sm:px-3 text-xs sm:text-[13px] font-semibold text-sx-text hover:border-sx-border-strong hover:bg-sx-surface-3 transition-colors disabled:opacity-60"
      >
        <span className="text-sm">🏪</span>
        <span className="min-w-0 max-w-[8rem] sm:max-w-[12rem] truncate font-bold">
          {switching ? "Switching…" : businessName}
        </span>
        <span aria-hidden className="text-sx-text-subtle text-[10px] sm:text-xs">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1.5 w-72 overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-1 shadow-[var(--sx-shadow-lg)] divide-y divide-sx-border/60"
        >
          {/* Active Brand Details & Brand Center CTA */}
          <div className="p-3 bg-sx-surface-2/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sx-text-subtle">Active Business</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">Live</span>
            </div>
            <p className="mt-1 text-[14px] font-bold text-sx-text truncate">{businessName}</p>
            <p className="text-[11px] text-sx-text-muted">{active?.role === "owner" ? "Owner Workspace" : "Team Member"}</p>

            <div className="mt-3 flex flex-col gap-1.5">
              <Link
                href="/app/brand"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-sx-sm bg-sx-accent/10 hover:bg-sx-accent/15 px-2.5 py-1.5 text-xs font-bold text-sx-accent transition-colors"
              >
                <span>Open Brand Center & Brain</span>
                <span>→</span>
              </Link>
              <Link
                href="/app/integrations"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-sx-sm bg-sx-surface-1 hover:bg-sx-surface-3 px-2.5 py-1.5 text-xs font-semibold text-sx-text transition-colors"
              >
                <span>Connected Accounts</span>
                <span className="text-sx-text-muted">›</span>
              </Link>
            </div>
          </div>

          {/* Multiple workspaces if available */}
          {tenants.length > 1 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sx-text-subtle">Switch Workspace</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {tenants.map((t) => (
                  <button
                    key={t.tenantId}
                    role="option"
                    aria-selected={active?.tenantId === t.tenantId}
                    onClick={() => {
                      setOpen(false);
                      if (t.tenantId !== active?.tenantId) void switchTenant(t.tenantId);
                    }}
                    className={`flex w-full min-h-10 items-center justify-between gap-2 rounded-sx-sm px-2.5 py-1.5 text-left text-xs hover:bg-sx-surface-2 transition-colors ${
                      active?.tenantId === t.tenantId ? "bg-sx-surface-2 font-bold text-sx-text" : "text-sx-text-muted"
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="block truncate">{t.name}</span>
                      <span className="block truncate text-[10px] text-sx-text-subtle">{t.role ?? "Staff support"}</span>
                    </span>
                    {active?.tenantId === t.tenantId && <span aria-hidden className="shrink-0 text-sx-accent font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
