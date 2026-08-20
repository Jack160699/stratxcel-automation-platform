import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import AppLogin from "./AppLogin";
import { OnboardingPanel } from "./OnboardingPanel";
import { CurrentTenantProvider } from "./CurrentTenantContext";
import { ClientAppShell } from "./ClientAppShell";
import { resolveCustomerPlanSummary } from "@/lib/billing/customer-plan";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { getTenantDigitalPresence } from "@/lib/connectors/canonical-status";

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

  const identity = await resolveCanonicalIdentity({ routeSurface: "app" });
  if (identity.state === "NO_SESSION") return <AppLogin />;
  if (identity.state === "INTERNAL_STAFF") redirect("/admin");
  if (identity.state === "NEW_CUSTOMER") return <OnboardingPanel isStaff={identity.isStaff} />;

  const tenants = identity.state === "STAFF_VIEWING_CLIENT"
    ? [{ ...identity.staffWorkspace, role: null, accessMode: "staff_support" as const }]
    : identity.tenants.map((tenant) => ({ ...tenant, accessMode: "customer" as const }));
  const active = tenants[0];
  const tenantDb = identity.supabase;
  const [subscriptionResult, auditResult, digitalPresence] = await Promise.all([
    tenantDb
      .from("subscriptions")
      .select("plan_tier, status, provider_status, current_period_end, next_charge_at, price_cents")
      .eq("tenant_id", active.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (async () => {
      const currentOrderId = await resolveCurrentAuditOrderId(tenantDb, active.tenantId);
      if (currentOrderId === null) return { data: null };
      let query = tenantDb.from("audit_orders").select("report_data").eq("tenant_id", active.tenantId);
      if (typeof currentOrderId === "string") query = query.eq("id", currentOrderId);
      else query = query.order("created_at", { ascending: false }).limit(1);
      return query.maybeSingle();
    })(),
    // Same canonical connector resolver Home/Audit already read (see
    // lib/connectors/canonical-status.ts) — the sidebar's business-identity
    // card (StratXcel Desktop canvas) reuses it rather than re-deriving
    // connection state from raw tables itself.
    getTenantDigitalPresence(tenantDb, active.tenantId).catch(() => null),
  ]);
  const plan = resolveCustomerPlanSummary(subscriptionResult.data);
  const report = auditResult.data?.report_data;
  const auditOpportunityCount =
    report && typeof report === "object" && Array.isArray((report as { opportunities?: unknown }).opportunities)
      ? (report as { opportunities: unknown[] }).opportunities.length
      : null;
  // Commercial recommendation is presented downstream after the audit report on VisualAuditReport.tsx
  // and /app/billing rather than an intrusive modal popup before the user has seen their audit.
  const showPlanPrompt = false;

  return (
    <CurrentTenantProvider initialTenants={tenants} initialActive={active}>
      <ClientAppShell
        tenantId={active.tenantId}
        email={identity.email ?? ""}
        name={identity.profileName}
        plan={plan}
        showPlanPrompt={showPlanPrompt}
        auditOpportunityCount={auditOpportunityCount}
        staffWorkspace={identity.state === "STAFF_VIEWING_CLIENT" ? { tenantName: identity.staffWorkspace.name } : null}
        isStaff={identity.isStaff}
        businessName={active.name}
        role={active.role}
        googleConnected={digitalPresence?.connections.google_business.connectionState === "CONNECTED"}
        whatsappConnected={digitalPresence?.connections.whatsapp.connectionState === "CONNECTED"}
      >
        {children}
      </ClientAppShell>
    </CurrentTenantProvider>
  );
}
