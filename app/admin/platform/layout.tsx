import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/admin/platform", label: "Overview" },
  { href: "/admin/platform/tenants", label: "Tenants" },
  { href: "/admin/platform/missions", label: "Missions" },
  { href: "/admin/platform/approvals", label: "Approvals" },
  { href: "/admin/platform/wallet", label: "Wallet" },
  { href: "/admin/platform/queue", label: "Queue" },
  { href: "/admin/platform/whatsapp", label: "WhatsApp" },
];

export default function PlatformAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-slate-100">StratExcel AI — Platform Admin</h1>
          <p className="text-sm text-slate-400">
            Phase 2–6 foundation modules. Everything here reflects real code state — shadow/disabled/test modes are
            shown as such, never faked as live.
          </p>
        </header>
        <nav className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="pb-16">{children}</main>
      </div>
    </div>
  );
}
