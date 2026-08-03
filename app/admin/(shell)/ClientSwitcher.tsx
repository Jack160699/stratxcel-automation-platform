"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useCurrentTenant } from "./CurrentTenantContext";

export function ClientSwitcher() {
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

  if (tenants.length === 0) {
    return <span className="text-xs text-slate-500">No clients yet</span>;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/20 text-[11px] font-semibold text-sky-300">
          {active ? active.name.slice(0, 1).toUpperCase() : "?"}
        </span>
        <span className="min-w-0 max-w-[10rem] truncate font-medium">
          {switching ? "Switching…" : active ? active.name : "Select a client"}
        </span>
        <span aria-hidden className="text-slate-500">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-2xl"
        >
          {tenants.map((t) => (
            <button
              key={t.tenantId}
              role="option"
              aria-selected={active?.tenantId === t.tenantId}
              onClick={() => {
                setOpen(false);
                if (t.tenantId !== active?.tenantId) void switchTenant(t.tenantId);
              }}
              className={`flex w-full min-h-11 items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                active?.tenantId === t.tenantId ? "bg-slate-800/70 text-slate-100" : "text-slate-300"
              }`}
            >
              <span className="min-w-0 truncate">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="block truncate text-xs text-slate-500">{t.slug} · {t.role}</span>
              </span>
              {active?.tenantId === t.tenantId && <span aria-hidden className="shrink-0 text-sky-400">✓</span>}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-800 pt-1">
            <Link
              href="/admin/platform/tenants"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center px-3 py-2 text-sm text-sky-300 hover:bg-slate-800"
            >
              + Create new client
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
