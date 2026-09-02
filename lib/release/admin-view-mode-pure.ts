/**
 * Pure admin-view-mode cookie helpers (no next/headers) — importable from
 * Node tests. Mirrors release-mode-pure.ts's shape exactly.
 */
import { isAdminViewMode, type AdminViewMode } from "./admin-view-mode-filter.ts";

export { isAdminViewMode, type AdminViewMode } from "./admin-view-mode-filter.ts";

export const ADMIN_VIEW_MODE_COOKIE = "sx_admin_view_mode";

export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function parseAdminViewMode(value: string | undefined | null): AdminViewMode {
  return isAdminViewMode(value) ? value : "normal";
}
