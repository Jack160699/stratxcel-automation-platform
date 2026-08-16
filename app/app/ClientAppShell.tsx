"use client";

import { usePathname } from "next/navigation";
import { returnToAdminAction } from "./staff-workspace-actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { APP_SIDEBAR_GROUPS, APP_MOBILE_NAV, resolveAppActiveKey } from "@/components/shell/navigation/app-navigation";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";
import type { CustomerPlanSummary } from "@/lib/billing/customer-plan";
import { CustomerHeaderActions } from "./components/CustomerHeaderActions";

/**
 * /app's own shell — the client/workspace product's information
 * architecture (components/shell/navigation/app-navigation.tsx), visually
 * built from the same shared CoreAppShell/Sidebar components /admin uses,
 * but a deliberately separate destination list — see app-navigation.tsx's
 * header comment. /app never renders agency-only destinations (Clients,
 * Operations Queue, System Health, Audit Log, internal Human Handoffs);
 * those exist only in /admin.
 */
export function ClientAppShell({
  tenantId,
  email,
  name,
  plan,
  showPlanPrompt,
  auditOpportunityCount,
  staffWorkspace,
  isStaff = false,
  children,
}: {
  tenantId: string;
  email: string;
  name: string | null;
  plan: CustomerPlanSummary;
  showPlanPrompt: boolean;
  auditOpportunityCount: number | null;
  staffWorkspace: { tenantName: string } | null;
  isStaff?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeKey = resolveAppActiveKey(pathname);

  return (
    <CoreAppShell
      product="App"
      sidebarGroups={APP_SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={APP_MOBILE_NAV}
      mobileMoreGroups={APP_SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href, icon: i.icon })),
      }))}
      topBarContext={<ClientTenantSwitcher />}
      userMenu={
        <CustomerHeaderActions
          tenantId={tenantId}
          email={email}
          name={name}
          plan={plan}
          showPlanPrompt={showPlanPrompt}
          auditOpportunityCount={auditOpportunityCount}
          isStaff={isStaff}
        />
      }
    >
      {staffWorkspace && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 px-4 py-3" role="status">
          <p className="text-sm font-medium text-sx-text">Viewing as Stratxcel staff · {staffWorkspace.tenantName}</p>
          <form action={returnToAdminAction}>
            <button type="submit" className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs font-semibold text-sx-text hover:bg-sx-elevated">
              Return to Admin
            </button>
          </form>
        </div>
      )}
      {children}
    </CoreAppShell>
  );
}
