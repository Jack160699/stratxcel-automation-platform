"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "./actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { APP_SIDEBAR_GROUPS, APP_MOBILE_NAV, resolveAppActiveKey } from "@/components/shell/navigation/app-navigation";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";
import { returnToAdminAction } from "./staff-workspace-actions";

/**
 * /app's own shell — the client/workspace product's information
 * architecture (components/shell/navigation/app-navigation.tsx), visually
 * built from the same shared CoreAppShell/Sidebar components /admin uses,
 * but a deliberately separate destination list — see app-navigation.tsx's
 * header comment. /app never renders agency-only destinations (Clients,
 * Operations Queue, System Health, Audit Log, internal Human Handoffs);
 * those exist only in /admin.
 */
export function ClientAppShell({ email, staffWorkspace, children }: { email: string; staffWorkspace: { tenantName: string } | null; children: React.ReactNode }) {
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
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })),
      }))}
      topBarContext={<ClientTenantSwitcher />}
      userMenu={
        <div className="flex items-center gap-2.5">
          <span className="hidden truncate text-xs text-sx-text-subtle sm:inline">{email}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-9 rounded-sx-sm border border-sx-border-strong px-2.5 text-xs font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
            >
              Sign out
            </button>
          </form>
        </div>
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
