import type { NavGroupData, NavItemData } from "./nav-types";

export function flattenNavGroups(groups: NavGroupData[]): NavItemData[] {
  return groups.flatMap((g) => g.items);
}

/**
 * Longest-prefix match so e.g. `/admin/leads` doesn't resolve to `overview`
 * just because `/admin` is also technically a valid prefix of it. Generic
 * over any NavGroupData[] — the same function resolves both /app's and
 * /admin's (now fully separate) nav trees.
 */
export function resolveActiveKey(pathname: string, groups: NavGroupData[]): string {
  const items = flattenNavGroups(groups);
  let best: NavItemData | null = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.key ?? items[0]?.key ?? "";
}
