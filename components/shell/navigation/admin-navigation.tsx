import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { ADMIN_NAV_GROUPS_DATA, ADMIN_MOBILE_NAV_KEYS } from "./admin-nav-data";
import { flattenNavGroups, resolveActiveKey as resolveActiveKeyGeneric } from "./active-route";
import { NAV_ICONS, DocIcon } from "./shared-icons";
import { filterNavGroupsByRelease } from "@/lib/release/nav-filter";
import { filterNavGroupsByMode, type AdminViewMode } from "@/lib/release/admin-view-mode-filter";
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

/** Full unfiltered admin nav (Stable release, Normal mode). Prefer getAdminSidebarGroups. */
export const ADMIN_SIDEBAR_GROUPS: SidebarNavGroup[] = withIcons(
  filterNavGroupsByMode(filterNavGroupsByRelease(ADMIN_NAV_GROUPS_DATA, { allowV2: false }), { mode: "normal" })
);

/**
 * Composes both independent nav axes: release (Stable/Beta — maturity) then
 * mode (Normal/Technical — audience). Order doesn't change the result
 * (each item's own release/mode are independent flags), release is applied
 * first purely so an empty Beta-only group never survives into the mode
 * pass with stale items.
 */
export function getAdminNavGroupsData(allowV2: boolean, viewMode: AdminViewMode = "normal"): NavGroupData[] {
  return filterNavGroupsByMode(filterNavGroupsByRelease(ADMIN_NAV_GROUPS_DATA, { allowV2 }), { mode: viewMode });
}

export function getAdminSidebarGroups(allowV2: boolean, viewMode: AdminViewMode = "normal"): SidebarNavGroup[] {
  return withIcons(getAdminNavGroupsData(allowV2, viewMode), { betaBadge: allowV2 });
}

export function getAdminMobileNav(allowV2: boolean, viewMode: AdminViewMode = "normal"): SidebarNavItem[] {
  return flattenNavGroups(getAdminNavGroupsData(allowV2, viewMode))
    .filter((item) => ADMIN_MOBILE_NAV_KEYS.includes(item.key))
    .map((item) => ({ ...item, icon: NAV_ICONS[item.key] ?? <DocIcon /> }));
}

/** Stable-only, Normal-mode mobile nav (default export for tests / SSR-safe callers). */
export const ADMIN_MOBILE_NAV: SidebarNavItem[] = getAdminMobileNav(false);

export function resolveAdminActiveKey(pathname: string, allowV2 = false, viewMode: AdminViewMode = "normal"): string {
  return resolveActiveKeyGeneric(pathname, getAdminNavGroupsData(allowV2, viewMode));
}
