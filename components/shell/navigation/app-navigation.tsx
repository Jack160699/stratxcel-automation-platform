import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { APP_NAV_GROUPS_DATA, APP_MOBILE_NAV_KEYS } from "./app-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";

/** /app's own sidebar groups — icon-merged from APP_NAV_GROUPS_DATA (app-nav-data.ts). This is the client/workspace product's information architecture; it does not share a data source with /admin's (see admin-navigation.tsx). */
export const APP_SIDEBAR_GROUPS: SidebarNavGroup[] = APP_NAV_GROUPS_DATA.map((group) => ({
  label: group.label,
  items: group.items.map((item): SidebarNavItem => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> })),
}));

export const APP_MOBILE_NAV: SidebarNavItem[] = flattenNavGroups(APP_NAV_GROUPS_DATA)
  .filter((item) => APP_MOBILE_NAV_KEYS.includes(item.key))
  .map((item) => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> }));

export function resolveAppActiveKey(pathname: string): string {
  return resolveActiveKeyGeneric(pathname, APP_NAV_GROUPS_DATA);
}
