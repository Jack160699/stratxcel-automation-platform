import { isReleaseVisible, type ProductRelease } from "./product-release.ts";

export interface ReleaseNavItem {
  key: string;
  label: string;
  href: string;
  /** Explicit release. Missing / unknown → fail closed (hidden). */
  release: ProductRelease;
}

export interface ReleaseNavGroup {
  label?: string;
  items: ReleaseNavItem[];
}

/**
 * Filter nav groups for the current visibility. Empty groups are dropped
 * so Stable mode never shows empty section headers (e.g. a Beta-only group).
 */
export function filterNavGroupsByRelease<T extends ReleaseNavGroup>(
  groups: T[],
  opts: { allowV2: boolean }
): T[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isReleaseVisible(item.release, opts)),
    }))
    .filter((group) => group.items.length > 0) as T[];
}

/** Stable (V1-only) slice — used as the default everyone else sees. */
export function stableNavGroups<T extends ReleaseNavGroup>(groups: T[]): T[] {
  return filterNavGroupsByRelease(groups, { allowV2: false });
}

/** Assert every item has an explicit known release — for tests. */
export function assertExplicitReleases(groups: ReleaseNavGroup[]): string[] {
  const failures: string[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.release !== "v1" && item.release !== "v2") {
        failures.push(`${group.label ?? "(ungrouped)"}/${item.key}: release=${String(item.release)}`);
      }
    }
  }
  return failures;
}
