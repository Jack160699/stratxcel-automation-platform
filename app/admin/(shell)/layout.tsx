import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireOwnerContext } from "@/lib/social/db-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { isBetaModeEnabled } from "@/lib/release/release-mode";
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
      <main className="flex min-h-screen items-center justify-center bg-sx-bg px-4">
        <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-7 text-center">
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">No access</h1>
          <p className="mt-2 text-sm text-sx-text-muted">This account is not authorized for the Command Center.</p>
        </div>
      </main>
    );
  }

  const [{ tenants, active }, betaEnabled] = await Promise.all([
    resolveCurrentTenant(ctx.supabase, ctx.ownerId),
    isBetaModeEnabled(),
  ]);

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <AppShell email={ctx.email ?? ""} betaEnabled={betaEnabled}>
        {children}
      </AppShell>
    </CurrentTenantProvider>
  );
}
