/**
 * Normal/Technical admin nav split (master build brief, Admin sections
 * 15-18). Mirrors nav-filter.ts's filterNavGroupsByRelease shape/pattern
 * exactly (same "map items, drop empty groups" structure), but on a
 * different, orthogonal axis: release is about maturity (Stable/Beta),
 * this is about audience (day-to-day agency ops vs engineering/system
 * tools). A nav item can independently be v1-stable-and-technical
 * (e.g. System Health) or v2-beta-and-technical (e.g. Hermes Mission
 * Control) — both axes apply together, neither implies the other.
 */
export type AdminViewMode = "normal" | "technical";

export interface ModeNavItem {
  key: string;
  label: string;
  href: string;
  /** Missing = "normal" -- every existing nav item outside /admin's own data never sets this and keeps showing in Normal mode unchanged. */
  mode?: AdminViewMode;
}

export interface ModeNavGroup {
  label?: string;
  items: ModeNavItem[];
}

export function isAdminViewMode(value: unknown): value is AdminViewMode {
  return value === "normal" || value === "technical";
}

/** Filter nav groups for the current admin view mode. Empty groups are dropped. */
export function filterNavGroupsByMode<T extends ModeNavGroup>(
  groups: T[],
  opts: { mode: AdminViewMode }
): T[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (item.mode ?? "normal") === opts.mode),
    }))
    .filter((group) => group.items.length > 0) as T[];
}
