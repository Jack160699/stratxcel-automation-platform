import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireOwnerContext } from "@/lib/social/db-context";
import AdminLogin from "../AdminLogin";

export const metadata: Metadata = {
  title: "Platform Admin — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { href: "/admin/platform", label: "Overview" },
  { href: "/admin/platform/tenants", label: "Tenants" },
  { href: "/admin/platform/missions", label: "Missions" },
  { href: "/admin/platform/approvals", label: "Approvals" },
  { href: "/admin/platform/payments", label: "Payments" },
  { href: "/admin/platform/wallet", label: "Wallet" },
  { href: "/admin/platform/queue", label: "Queue" },
  { href: "/admin/platform/whatsapp", label: "WhatsApp" },
];

/**
 * Single admin-auth gate for the entire /admin/platform subtree, mirroring
 * app/admin/social/layout.tsx's use of the same requireOwnerContext(). Every
 * nested page here is a "use client" shell that only reads/writes through
 * /api/platform/* routes — each of those independently enforces
 * requireTenantContext()/getUser() server-side — except this subtree's own
 * page.tsx (the overview), which reads only process.env, never the
 * database. Neither case needs its own additional server-side guard, so
 * this layout is the sole gate, same as the social subtree's design.
 */
export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOwnerContext();

  if (!ctx.ok) {
    if (ctx.status === 401) return <AdminLogin />;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-7 text-center">
          <h1 className="text-xl font-semibold text-slate-100">No access</h1>
          <p className="mt-2 text-sm text-slate-400">Not authorised for Platform Admin.</p>
        </div>
      </main>
    );
  }

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
