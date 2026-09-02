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
import { AdminViewModeToggle } from "@/components/shell/AdminViewModeToggle";
import type { AdminViewMode } from "@/lib/release/admin-view-mode-filter";
import { ClientSwitcher } from "./ClientSwitcher";
import { ContextSwitcher } from "@/components/shell/ContextSwitcher";
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
  viewMode,
  children,
}: {
  email: string;
  betaEnabled: boolean;
  viewMode: AdminViewMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sidebarGroups = getAdminSidebarGroups(betaEnabled, viewMode);
  const mobileNavItems = getAdminMobileNav(betaEnabled, viewMode);
  const activeKey = resolveAdminActiveKey(pathname, betaEnabled, viewMode);

  return (
    <CoreAppShell
      product="Admin"
      sidebarGroups={sidebarGroups}
      activeKey={activeKey}
      mobileNavItems={mobileNavItems}
      mobileMoreGroups={sidebarGroups.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href, icon: i.icon })),
      }))}
      topBarContext={<ClientSwitcher />}
      staffBadge={
        <div className="flex items-center gap-2">
          <AdminViewModeToggle technical={viewMode === "technical"} />
          <AdminBetaModeToggle enabled={betaEnabled} />
        </div>
      }
      userMenu={
        <div className="flex items-center gap-2.5">
          <ContextSwitcher currentContext="admin" compact />
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
