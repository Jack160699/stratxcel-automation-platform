"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import {
  getAdminSidebarGroups,
  getAdminMobileNav,
  resolveAdminActiveKey,
} from "@/components/shell/navigation/admin-navigation";
import { AdminViewModeSegmented } from "@/components/admin/shell/AdminViewModeSegmented";
import { AdminChannelSelector } from "@/components/admin/shell/AdminChannelSelector";
import { AdminFounderMenu } from "@/components/admin/shell/AdminFounderMenu";
import { AdminThemeButton } from "@/components/admin/shell/AdminThemeButton";
import type { AdminViewMode } from "@/lib/release/admin-view-mode-filter";
import { ClientSwitcher } from "./ClientSwitcher";
import { ContextSwitcher } from "@/components/shell/ContextSwitcher";

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

  // StratXcel Office owns the entire viewport (100vw x 100vh) without admin sidebar or chrome
  const isOffice = pathname === "/admin/office";
  if (isOffice) {
    return (
      <main className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#06080d]">
        {children}
      </main>
    );
  }

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
          <AdminViewModeSegmented technical={viewMode === "technical"} />
          <AdminChannelSelector enabled={betaEnabled} />
        </div>
      }
      userMenu={
        <div className="flex items-center gap-2">
          <ContextSwitcher currentContext="admin" compact />
          <AdminThemeButton />
          <AdminFounderMenu email={email} />
        </div>
      }
    >
      {children}
    </CoreAppShell>
  );
}
