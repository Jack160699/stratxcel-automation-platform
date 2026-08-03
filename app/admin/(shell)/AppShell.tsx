"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/app/components/Mark";
import { signOutAction } from "@/app/admin/actions";
import { ClientSwitcher } from "./ClientSwitcher";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Command Center" },
  { href: "/admin/platform/tenants", label: "Clients" },
  { href: "/admin/platform/missions", label: "Missions" },
  { href: "/admin/platform/approvals", label: "Approvals" },
  { href: "/admin/social", label: "Content / Social Autopilot" },
  { href: "/admin/inbox", label: "CRM / Contact Inbox" },
  { href: "/admin/platform/wallet", label: "Wallet" },
  { href: "/admin/platform/queue", label: "Queue" },
  { href: "/admin/social/integrations", label: "Integrations" },
  { href: "/admin/social/system", label: "System" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
              active ? "bg-sky-500/15 font-medium text-sky-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-60 shrink-0 flex-col gap-1 border-r border-slate-800 bg-slate-900/40 p-4 lg:flex"
        aria-label="Primary navigation"
      >
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <Mark className="h-7 w-7" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-300">Stratxcel</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks />
        </nav>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/40 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-300 lg:hidden"
          >
            <span aria-hidden>☰</span>
          </button>
          <div className="min-w-0 flex-1">
            <ClientSwitcher />
          </div>
          <span className="hidden truncate text-xs text-slate-500 sm:inline">{email}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </button>
          </form>
        </header>

        {/* Mobile nav overlay */}
        {mobileOpen && (
          <nav
            aria-label="Primary navigation"
            className="flex flex-col gap-1 border-b border-slate-800 bg-slate-900/95 p-3 lg:hidden"
          >
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </nav>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
