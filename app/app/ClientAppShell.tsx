"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "./actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { buildSidebarGroups, flattenNavItems, resolveActiveKey } from "@/components/shell/navigation";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";

/**
 * /app's shell — the exact same components/shell/CoreAppShell.tsx used by
 * /admin (app/admin/(shell)/AppShell.tsx), now built from the same canonical
 * nav model (components/shell/navigation.tsx) instead of its own independent
 * item array. This is the literal fix for "an owner moving /app/crm ->
 * /admin/missions -> /app/conversations must not feel like the left side of
 * the product was replaced": both shells render the same shared groups in
 * the same order; only /admin appends its own agency-only "Admin" group.
 *
 * "CRM & Leads" and "Conversations" are no longer two separate nav items —
 * /app/conversations now redirects into the unified CRM/inbox workspace at
 * /app/crm (see app/app/conversations/page.tsx), so there is exactly one
 * "CRM" destination, matching /admin's "Leads" (now also the same workspace,
 * scoped to whichever client is selected — app/admin/(shell)/leads/page.tsx).
 */
const SIDEBAR_GROUPS = buildSidebarGroups("app");
const FLAT_ITEMS = flattenNavItems("app");

const MOBILE_NAV = FLAT_ITEMS.filter((i) => ["home", "copilot", "missions", "approvals"].includes(i.key));

export function ClientAppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = resolveActiveKey(pathname, "app");

  return (
    <CoreAppShell
      product="App"
      sidebarGroups={SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={MOBILE_NAV}
      mobileMoreGroups={SIDEBAR_GROUPS.map((g) => ({
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
