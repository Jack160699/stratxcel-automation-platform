"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import {
  getAdminSidebarGroups,
  getAdminMobileNav,
  resolveAdminActiveKey,
} from "@/components/shell/navigation/admin-navigation";
import { AdminBetaModeToggle } from "@/components/shell/AdminBetaModeToggle";
import { ClientSwitcher } from "./ClientSwitcher";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

/**
 * /admin's own shell — Stratxcel staff/agency information architecture
 * (components/shell/navigation/admin-navigation.tsx), visually built from
 * the same shared CoreAppShell/Sidebar components /app uses, but a
 * deliberately separate destination list. Route paths are unchanged
 * (no renames) so nothing here can break a bookmark.
 *
 * Beta Mode is resolved server-side and passed in — never from localStorage.
 */
export function AppShell({
  email,
  betaEnabled,
  children,
}: {
  email: string;
  betaEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sidebarGroups = getAdminSidebarGroups(betaEnabled);
  const mobileNavItems = getAdminMobileNav(betaEnabled);
  const activeKey = resolveAdminActiveKey(pathname, betaEnabled);

  return (
    <CoreAppShell
      product="Admin"
      sidebarGroups={sidebarGroups}
      activeKey={activeKey}
      mobileNavItems={mobileNavItems}
      mobileMoreGroups={sidebarGroups.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })),
      }))}
      topBarContext={<ClientSwitcher />}
      staffBadge={<AdminBetaModeToggle enabled={betaEnabled} />}
      userMenu={
        <div className="flex items-center gap-2.5">
          <span className="hidden truncate text-xs text-sx-text-subtle sm:inline">{email}</span>
          <ThemeToggle />
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
