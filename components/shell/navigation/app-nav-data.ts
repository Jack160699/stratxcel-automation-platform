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
    items: [{ key: "home", label: "Command Center", href: "/app", release: "v1" }],
  },
  {
    label: "Get things done",
    items: [
      { key: "copilot", label: "Copilot", href: "/app/copilot", release: "v1" },
      { key: "missions", label: "Work", href: "/app/missions", release: "v1" },
      { key: "approvals", label: "Approvals", href: "/app/approvals", release: "v1" },
    ],
  },
  {
    label: "Grow",
    items: [
      { key: "website", label: "Website", href: "/app/website", release: "v1" },
      { key: "search", label: "Search & SEO", href: "/app/search", release: "v1" },
      { key: "crm", label: "Leads & CRM", href: "/app/crm", release: "v1" },
      { key: "ads", label: "Ads", href: "/app/ads", release: "v1" },
    ],
  },
  {
    label: "Results",
    items: [{ key: "reports", label: "Reports", href: "/app/reports", release: "v1" }],
  },
  {
    label: "Business",
    items: [
      { key: "brand", label: "Brand Brain", href: "/app/brand", release: "v1" },
      { key: "integrations", label: "Integrations", href: "/app/integrations", release: "v1" },
      { key: "billing", label: "Billing", href: "/app/billing", release: "v1" },
      { key: "team", label: "Team", href: "/app/team", release: "v1" },
      { key: "settings", label: "Settings", href: "/app/settings", release: "v1" },
    ],
  },
];

/** Mobile primary: Home, Copilot, Work, Approvals — remaining modules in More. */
export const APP_MOBILE_NAV_KEYS = ["home", "copilot", "missions", "approvals"];
