import type { ReactNode } from "react";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { APP_NAV_GROUPS_DATA, APP_MOBILE_NAV_KEYS } from "./app-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";
import { HouseIcon, AuditCheckIcon, GrowthIcon, StorefrontIcon } from "./app-nav-icons";

/**
 * Icon overrides for keys that only exist in /app's own nav (never shared
 * with /admin's admin-nav-data.ts — see the key-overlap check in
 * shared-icons.tsx's usage) — matches the StratXcel Desktop Claude Design
 * canvas exactly for these four primary destinations without touching the
 * NAV_ICONS record /admin also reads from.
 */
const APP_ICON_OVERRIDES: Record<string, ReactNode> = {
  home: <HouseIcon />,
  "customer-audit": <AuditCheckIcon />,
  copilot: <GrowthIcon />,
  brand: <StorefrontIcon />,
};

function iconFor(key: string): ReactNode {
  return APP_ICON_OVERRIDES[key] ?? NAV_ICONS[key] ?? <DocIcon />;
}

/** /app's own sidebar groups — icon-merged from APP_NAV_GROUPS_DATA (app-nav-data.ts). This is the client/workspace product's information architecture; it does not share a data source with /admin's (see admin-navigation.tsx). */
export const APP_SIDEBAR_GROUPS: SidebarNavGroup[] = APP_NAV_GROUPS_DATA.map((group) => ({
  label: group.label,
  items: group.items.map((item): SidebarNavItem => ({ ...item, labelHi: item.labelHi, icon: iconFor(item.key) })),
}));

export const APP_MOBILE_NAV: SidebarNavItem[] = flattenNavGroups(APP_NAV_GROUPS_DATA)
  .filter((item) => APP_MOBILE_NAV_KEYS.includes(item.key))
  .map((item) => ({ ...item, labelHi: item.labelHi, icon: iconFor(item.key) }));

export function resolveAppActiveKey(pathname: string): string {
  return resolveActiveKeyGeneric(pathname, APP_NAV_GROUPS_DATA);
}
