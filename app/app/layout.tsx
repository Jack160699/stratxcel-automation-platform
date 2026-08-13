import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { ensureCustomerWorkspaceForAppEntry } from "@/app/actions/auth";
import AppLogin from "./AppLogin";
import { OnboardingPanel } from "./OnboardingPanel";
import { CurrentTenantProvider } from "./CurrentTenantContext";
import { ClientAppShell } from "./ClientAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stratxcel",
  robots: { index: false, follow: false },
};

/**
 * Canonical client-workspace identity and tenant gate. Customer membership
 * selects the tenant context; staff may enter only with an explicit signed
 * workspace context. Missing auth configuration fails closed to sign-in.
 */
export default async function ClientLayout({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <AppLogin />;
  }

  const initial = await resolveCanonicalIdentity();
  if (initial.state === "NO_SESSION") return <AppLogin />;

  if (initial.state === "INTERNAL_STAFF") {
    if (initial.tenants.length > 0) {
      await ensureCustomerWorkspaceForAppEntry(initial.userId, true);
    } else {
      redirect("/admin");
    }
  }

  const identity =
    initial.state === "INTERNAL_STAFF" && initial.tenants.length > 0
      ? await resolveCanonicalIdentity()
      : initial;

  if (identity.state === "NO_SESSION") return <AppLogin />;
  if (identity.state === "INTERNAL_STAFF") redirect("/admin");
  if (identity.state === "NEW_CUSTOMER") return <OnboardingPanel />;

  const tenants = identity.state === "STAFF_VIEWING_CLIENT"
    ? [{ ...identity.staffWorkspace, role: null, accessMode: "staff_support" as const }]
    : identity.tenants.map((tenant) => ({ ...tenant, accessMode: "customer" as const }));
  const active = tenants[0];

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <ClientAppShell
        email={identity.email ?? ""}
        staffWorkspace={identity.state === "STAFF_VIEWING_CLIENT" ? { tenantName: identity.staffWorkspace.name } : null}
      >
        {children}
      </ClientAppShell>
    </CurrentTenantProvider>
  );
}
