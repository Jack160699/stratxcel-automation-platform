"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { ADMIN_SIDEBAR_GROUPS, ADMIN_MOBILE_NAV, resolveAdminActiveKey } from "@/components/shell/navigation/admin-navigation";
import { ClientSwitcher } from "./ClientSwitcher";

/**
 * /admin's own shell — Stratxcel staff/agency information architecture
 * (components/shell/navigation/admin-navigation.tsx), visually built from
 * the same shared CoreAppShell/Sidebar components /app uses, but a
 * deliberately separate destination list. A previous pass merged /app's and
 * /admin's navigation into one canonical item array (shared appHref/adminHref
 * per concept) — that conceptually merged two different products with
 * different jobs and was reverted; see admin-navigation.tsx's header
 * comment. Route paths are unchanged (no renames) so nothing here can break
 * a bookmark.
 */
export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = resolveAdminActiveKey(pathname);

  return (
    <CoreAppShell
      product="Admin"
      sidebarGroups={ADMIN_SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={ADMIN_MOBILE_NAV}
      mobileMoreGroups={ADMIN_SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })),
      }))}
      topBarContext={<ClientSwitcher />}
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
