import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { resolveCurrentTenant, type TenantMembership } from "@/lib/tenants/current-tenant";
import { isBetaModeEnabled } from "@/lib/release/release-mode";
import { getAdminViewMode } from "@/lib/release/admin-view-mode";
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
  const identity = await resolveCanonicalIdentity({ routeSurface: "admin" });
  if (identity.state === "NO_SESSION") return <AdminLogin />;
  if (identity.state === "CUSTOMER_MEMBER" || identity.state === "NEW_CUSTOMER") redirect("/app");

  const [{ tenants, active }, betaEnabled, viewMode] = await Promise.all([
    resolveCurrentTenant(identity.supabase, identity.userId),
    isBetaModeEnabled(),
    getAdminViewMode(),
  ]);

  // resolveCanonicalIdentity already re-verified (via the same signed
  // staff-workspace cookie + getAgencyTenant check every CRM/API read
  // route trusts) that this staff member has validly entered a specific
  // client's workspace -- but resolveCurrentTenant above only ever looks
  // at this admin's OWN tenant_members rows, so it can never surface that
  // client. Without this, every page under the shell (leads, missions,
  // finance, approvals, audit, integrations, handoffs, connectors,
  // operations) silently falls back to the admin's own tenant instead of
  // the client they explicitly opened via "View client workspace".
  let initialTenants = tenants;
  let initialActive = active;
  if (identity.state === "STAFF_VIEWING_CLIENT") {
    const staffTenant: TenantMembership = {
      tenantId: identity.staffWorkspace.tenantId,
      name: identity.staffWorkspace.name,
      slug: identity.staffWorkspace.slug,
      // Staff-support access already bypasses per-role permission checks
      // server-side (requireTenantReadPermission only enforces role for
      // accessMode "customer") -- "owner" here just reflects that reality
      // for the client-side can()-gated UI (composer, manage controls).
      role: "owner",
    };
    initialTenants = [staffTenant, ...tenants.filter((t) => t.tenantId !== staffTenant.tenantId)];
    initialActive = staffTenant;
  }

  return (
    <CurrentTenantProvider initialTenants={initialTenants} initialActive={initialActive}>
      <AppShell email={identity.email ?? ""} betaEnabled={betaEnabled} viewMode={viewMode}>
        {children}
      </AppShell>
    </CurrentTenantProvider>
  );
}
