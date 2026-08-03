import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import AppLogin from "./AppLogin";
import { OnboardingPanel } from "./OnboardingPanel";
import { CurrentTenantProvider } from "./CurrentTenantContext";
import { ClientAppShell } from "./ClientAppShell";

export const metadata: Metadata = {
  title: "Stratxcel",
  robots: { index: false, follow: false },
};

/**
 * /app's single auth + tenant-resolution gate — the client-workspace
 * mirror of app/admin/(shell)/layout.tsx. Gated by requireClientContext()
 * (any authenticated user; no stratxcel_admins row required — see
 * lib/tenants/client-context.ts), never the staff-only owner gate, so this
 * route tree can never accidentally require staff status. Zero
 * memberships → OnboardingPanel; otherwise the same membership-verified
 * resolveCurrentTenant() call /admin already uses, unchanged.
 */
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const ctx = await requireClientContext();

  if (!ctx.ok) {
    return <AppLogin />;
  }

  const { tenants, active } = await resolveCurrentTenant(ctx.supabase, ctx.userId);

  if (!active) {
    return <OnboardingPanel />;
  }

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <ClientAppShell email={ctx.email ?? ""}>{children}</ClientAppShell>
    </CurrentTenantProvider>
  );
}
