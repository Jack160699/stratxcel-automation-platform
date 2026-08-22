import type { ReactNode } from "react";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { APP_NAV_GROUPS_DATA, APP_MOBILE_NAV_KEYS } from "./app-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";
import { HouseIcon, AuditCheckIcon, ContentIcon, GrowthIcon, StorefrontIcon } from "./app-nav-icons";

/**
 * Icon overrides for keys that exist in /app's canonical nav:
 * Home | Audit | Content | Growth (primary) + Brand (secondary/More)
 */
const APP_ICON_OVERRIDES: Record<string, ReactNode> = {
  home: <HouseIcon />,
  "customer-audit": <AuditCheckIcon />,
  content: <ContentIcon />,
  growth: <GrowthIcon />,
  brand: <StorefrontIcon />,
};

function iconFor(key: string): ReactNode {
  return APP_ICON_OVERRIDES[key] ?? NAV_ICONS[key] ?? <DocIcon />;
}

/** /app's own sidebar groups — icon-merged from APP_NAV_GROUPS_DATA (app-nav-data.ts). */
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
