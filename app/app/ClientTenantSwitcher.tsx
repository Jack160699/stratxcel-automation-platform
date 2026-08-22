"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useCurrentTenant } from "./CurrentTenantContext";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Interactive Brand & Workspace Selector in the customer top header.
 * Replaces random decorative icons with real brand identity/initials and
 * provides instant access to the canonical Brand Center (/app/brand).
 */
export function ClientTenantSwitcher() {
  const { tenants, active, switching, switchTenant } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active?.tenantId) return;
    fetch(`/api/platform/brand?tenantId=${encodeURIComponent(active.tenantId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.brandBrain?.content?.logo_url) {
          setLogoUrl(data.brandBrain.content.logo_url);
        } else {
          setLogoUrl(null);
        }
      })
      .catch(() => setLogoUrl(null));
  }, [active?.tenantId]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const businessName = active?.name ?? "Your Business";
  const initials = getInitials(businessName);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        aria-label={`Current shop: ${businessName}. Open shop menu`}
        className="flex min-h-10 min-w-0 items-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-2.5 sm:px-3 text-xs sm:text-[13px] font-semibold text-sx-text hover:border-sx-border-strong hover:bg-sx-surface-2 transition-colors disabled:opacity-60 shadow-xs"
      >
        {logoUrl ? (
          <img src={logoUrl} alt={businessName} className="h-6 w-6 shrink-0 rounded-full object-cover border border-sx-border" />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sx-accent/15 text-[11px] font-bold text-sx-accent">
            {initials}
          </span>
        )}
        <span className="min-w-0 max-w-[8rem] sm:max-w-[14rem] truncate font-bold text-sx-text">
          {switching ? "Switching…" : businessName}
        </span>
        <span aria-hidden className="text-sx-text-subtle text-[11px] sm:text-xs">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-50 mt-1.5 w-76 overflow-hidden rounded-sx-md border border-sx-border bg-sx-surface-1 shadow-[var(--sx-shadow-lg)] divide-y divide-sx-border/60"
        >
          {/* Active Shop Details & My Shop CTA */}
          <div className="p-3.5 bg-sx-surface-2/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sx-text-subtle">Shop Identity</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">Active</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} className="h-8 w-8 shrink-0 rounded-full object-cover border border-sx-border" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sx-accent/20 text-xs font-bold text-sx-accent">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-sx-text truncate">{businessName}</p>
                <p className="text-[11px] text-sx-text-muted">{active?.role === "owner" ? "Owner Workspace" : "Team Member"}</p>
              </div>
            </div>

            <div className="mt-3.5 flex flex-col gap-1.5">
              <Link
                href="/app/brand"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-sx-sm bg-sx-accent hover:bg-sx-accent-hover px-3 py-2 text-xs font-bold text-sx-accent-on transition-colors shadow-xs"
              >
                <span>My Shop</span>
                <span>→</span>
              </Link>
              <Link
                href="/app/integrations"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-sx-sm bg-sx-surface-1 hover:bg-sx-surface-3 px-3 py-2 text-xs font-semibold text-sx-text transition-colors border border-sx-border"
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
                    {active?.tenantId === t.tenantId && <span className="text-sx-accent font-bold">✓</span>}
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
