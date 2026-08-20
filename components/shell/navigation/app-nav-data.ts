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
    items: [{ key: "home", label: "Home", href: "/app", release: "v1", labelHi: "होम" }],
  },
  {
    label: "Growth",
    items: [
      { key: "website", label: "Website", href: "/app/website", release: "v1", labelHi: "वेबसाइट" },
      { key: "customer-audit", label: "Audit", href: "/app/audit", release: "v1", labelHi: "जाँच" },
      { key: "brand", label: "Business", href: "/app/brand", release: "v1", labelHi: "व्यापार" },
    ],
  },
  {
    label: "Execution",
    items: [
      { key: "copilot", label: "Copilot", href: "/app/social/copilot", release: "v1", labelHi: "सहायक" },
      { key: "integrations", label: "Connectors", href: "/app/integrations", release: "v1", labelHi: "कनेक्शन" },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "billing", label: "Billing & Plans", href: "/app/billing", release: "v1", labelHi: "भुगतान" },
      { key: "team", label: "Team", href: "/app/team", release: "v1", labelHi: "टीम" },
      { key: "settings", label: "Settings", href: "/app/settings", release: "v1", labelHi: "सेटिंग्स" },
    ],
  },
];

/** Mobile primary dock: Home, Audit, Copilot, Business — More sheet holds Website, Connectors, Billing, Team, Settings. */
export const APP_MOBILE_NAV_KEYS = ["home", "customer-audit", "copilot", "brand"];
