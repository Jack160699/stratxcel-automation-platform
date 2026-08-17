import type { NavGroupData } from "./nav-types";

/**
 * The client/workspace product's own information architecture — /app/*.
 * Used by tenant members running their own business. Deliberately NOT
 * derived from (or shared with) ADMIN_NAV_GROUPS_DATA in ./admin-nav-data.ts
 * — the previous "one canonical nav item mapped to both an appHref and an
 * adminHref" design conceptually merged two different products with
 * different jobs into one information architecture, which is exactly the
 * regression this file exists to undo. /app and /admin share the visual
 * shell (Sidebar, CoreAppShell, icons, spacing) — never the destination
 * list itself.
 *
 * Customer /app is V1 only — no Beta toggle, and no V2 release classification on items.
 * Only tenant-safe, customer-ready destinations belong here. Staff-scoped
 * Social surfaces stay out of the customer shell until tenant ownership is
 * enforced by their storage and APIs.
 */
export const APP_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    label: "Overview",
    items: [{ key: "home", label: "Home", href: "/app", release: "v1" }],
  },
  {
    label: "Growth",
    items: [
      { key: "customer-audit", label: "Audit", href: "/app/audit", release: "v1" },
      { key: "brand", label: "Business", href: "/app/brand", release: "v1" },
    ],
  },
  {
    label: "Execution",
    items: [
      { key: "copilot", label: "Copilot", href: "/app/social/copilot", release: "v1" },
      { key: "integrations", label: "Connectors", href: "/app/integrations", release: "v1" },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "billing", label: "Billing & Plans", href: "/app/billing", release: "v1" },
      { key: "team", label: "Team", href: "/app/team", release: "v1" },
      { key: "settings", label: "Settings", href: "/app/settings", release: "v1" },
    ],
  },
];

/** Mobile primary dock: Home, Audit, Copilot, Business — More sheet holds the rest. */
export const APP_MOBILE_NAV_KEYS = ["home", "customer-audit", "copilot", "brand"];
