import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { ADMIN_NAV_GROUPS_DATA, ADMIN_MOBILE_NAV_KEYS } from "./admin-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";

/** /admin's own sidebar groups — icon-merged from ADMIN_NAV_GROUPS_DATA (admin-nav-data.ts). This is Stratxcel staff's agency-operations information architecture; it does not share a data source with /app's (see app-navigation.tsx). */
export const ADMIN_SIDEBAR_GROUPS: SidebarNavGroup[] = ADMIN_NAV_GROUPS_DATA.map((group) => ({
  label: group.label,
  items: group.items.map((item): SidebarNavItem => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> })),
}));

export const ADMIN_MOBILE_NAV: SidebarNavItem[] = flattenNavGroups(ADMIN_NAV_GROUPS_DATA)
  .filter((item) => ADMIN_MOBILE_NAV_KEYS.includes(item.key))
  .map((item) => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> }));

export function resolveAdminActiveKey(pathname: string): string {
  return resolveActiveKeyGeneric(pathname, ADMIN_NAV_GROUPS_DATA);
}
