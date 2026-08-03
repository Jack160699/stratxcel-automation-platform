import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireOwnerContext } from "@/lib/social/db-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import AdminLogin from "@/app/admin/AdminLogin";
import { CurrentTenantProvider } from "./CurrentTenantContext";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  title: "Command Center — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * Single owner-auth gate + tenant-resolution point for the unified shell
 * (Command Center, Clients/Missions/Approvals/Wallet/Queue/WhatsApp under
 * /admin/platform, and the contact inbox). Mirrors the same
 * requireOwnerContext() pattern app/admin/social/layout.tsx and the
 * previous app/admin/platform/layout.tsx already used — this is a
 * consolidation of that existing pattern, not a new auth system.
 *
 * /admin/social is intentionally NOT nested under this route group (it
 * lives as a sibling directory outside the "(shell)" group) so it keeps
 * its own independent SocialShell chrome and guards untouched, rather than
 * being double-wrapped by this layout — see route-groups.md: opting some
 * segments into a shared layout while keeping others out is exactly what
 * route groups are for.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOwnerContext();

  if (!ctx.ok) {
    if (ctx.status === 401) return <AdminLogin />;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-7 text-center">
          <h1 className="text-xl font-semibold text-slate-100">No access</h1>
          <p className="mt-2 text-sm text-slate-400">This account is not authorized for the Command Center.</p>
        </div>
      </main>
    );
  }

  const { tenants, active } = await resolveCurrentTenant(ctx.supabase, ctx.ownerId);

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <AppShell email={ctx.email ?? ""}>{children}</AppShell>
    </CurrentTenantProvider>
  );
}
