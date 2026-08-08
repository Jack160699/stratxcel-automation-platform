"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { buildSidebarGroups, flattenNavItems, resolveActiveKey } from "@/components/shell/navigation";
import { ClientSwitcher } from "./ClientSwitcher";

/**
 * Re-skinned onto the shared Stratxcel Core shell (components/shell/CoreAppShell.tsx),
 * now consuming the one canonical nav model in components/shell/navigation.tsx
 * instead of a hand-written item array that had drifted from app/app/ClientAppShell.tsx's
 * own copy — see that file's header comment and
 * docs/product-design/ADMIN_INFORMATION_ARCHITECTURE.md §1. Route paths are
 * unchanged from before this pass (no renames/redirects) so nothing here can
 * break a bookmark; only the grouping/labeling that made /admin feel like a
 * different product from /app has changed.
 */
const SIDEBAR_GROUPS = buildSidebarGroups("admin");
const FLAT_ITEMS = flattenNavItems("admin");

const MOBILE_NAV = FLAT_ITEMS.filter((i) => ["home", "missions", "approvals", "clients"].includes(i.key));

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = resolveActiveKey(pathname, "admin");

  return (
    <CoreAppShell
      product="Admin"
      sidebarGroups={SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={MOBILE_NAV}
      mobileMoreGroups={SIDEBAR_GROUPS.map((g) => ({
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
