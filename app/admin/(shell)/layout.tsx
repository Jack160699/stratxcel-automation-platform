import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { isBetaModeEnabled } from "@/lib/release/release-mode";
import { establishPendingWorkspaceIntent, ensureAdminWorkspaceForAdminEntry } from "@/app/actions/auth";
import AdminLogin from "@/app/admin/AdminLogin";
import { CurrentTenantProvider } from "./CurrentTenantContext";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  title: "Command Center — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * Canonical staff identity gate and tenant-resolution point for the entire
 * admin product, including Social Operations. Customer identities are
 * redirected before any admin chrome or data is rendered.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const identity = await resolveCanonicalIdentity();
  if (identity.state === "NO_SESSION") {
    await establishPendingWorkspaceIntent("admin");
    return <AdminLogin />;
  }
  if (identity.state === "CUSTOMER_MEMBER" || identity.state === "NEW_CUSTOMER") redirect("/app");

  await ensureAdminWorkspaceForAdminEntry(identity.userId);

  const [{ tenants, active }, betaEnabled] = await Promise.all([
    resolveCurrentTenant(identity.supabase, identity.userId),
    isBetaModeEnabled(),
  ]);

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <AppShell email={identity.email ?? ""} betaEnabled={betaEnabled}>
        {children}
      </AppShell>
    </CurrentTenantProvider>
  );
}
