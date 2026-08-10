import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { ADMIN_NAV_GROUPS_DATA, ADMIN_MOBILE_NAV_KEYS } from "./admin-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";
import { filterNavGroupsByRelease } from "@/lib/release/nav-filter";
import type { NavGroupData } from "./nav-types";

function withIcons(groups: NavGroupData[], opts?: { betaBadge?: boolean }): SidebarNavGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item): SidebarNavItem => ({
      ...item,
      icon: NAV_ICONS[item.key] ?? <DocIcon />,
      badge: opts?.betaBadge && item.release === "v2" ? "Beta" : undefined,
    })),
  }));
}

/** Full unfiltered admin nav (includes V2). Prefer getAdminSidebarGroups. */
export const ADMIN_SIDEBAR_GROUPS: SidebarNavGroup[] = withIcons(
  filterNavGroupsByRelease(ADMIN_NAV_GROUPS_DATA, { allowV2: false })
);

export function getAdminNavGroupsData(allowV2: boolean): NavGroupData[] {
  return filterNavGroupsByRelease(ADMIN_NAV_GROUPS_DATA, { allowV2 });
}

export function getAdminSidebarGroups(allowV2: boolean): SidebarNavGroup[] {
  return withIcons(getAdminNavGroupsData(allowV2), { betaBadge: allowV2 });
}

export function getAdminMobileNav(allowV2: boolean): SidebarNavItem[] {
  return flattenNavGroups(getAdminNavGroupsData(allowV2))
    .filter((item) => ADMIN_MOBILE_NAV_KEYS.includes(item.key))
    .map((item) => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> }));
}

/** Stable-only mobile nav (default export for tests / SSR-safe callers). */
export const ADMIN_MOBILE_NAV: SidebarNavItem[] = getAdminMobileNav(false);

export function resolveAdminActiveKey(pathname: string, allowV2 = false): string {
  return resolveActiveKeyGeneric(pathname, getAdminNavGroupsData(allowV2));
}
