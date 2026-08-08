"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "./actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { APP_SIDEBAR_GROUPS, APP_MOBILE_NAV, resolveAppActiveKey } from "@/components/shell/navigation/app-navigation";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";

/**
 * /app's own shell — the client/workspace product's information
 * architecture (components/shell/navigation/app-navigation.tsx), visually
 * built from the same shared CoreAppShell/Sidebar components /admin uses,
 * but a deliberately separate destination list — see app-navigation.tsx's
 * header comment. /app never renders agency-only destinations (Clients,
 * Operations Queue, System Health, Audit Log, internal Human Handoffs);
 * those exist only in /admin.
 */
export function ClientAppShell({ email, children }: { email: string; children: React.ReactNode }) {
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
      {children}
    </CoreAppShell>
  );
}
