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
 */
export const APP_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    label: "Overview",
    items: [
      { key: "home", label: "Command Center", href: "/app" },
      { key: "copilot", label: "Copilot", href: "/app/copilot" },
    ],
  },
  {
    label: "Work",
    items: [
      { key: "missions", label: "Missions", href: "/app/missions" },
      { key: "approvals", label: "Approvals", href: "/app/approvals" },
    ],
  },
  {
    label: "Content",
    items: [
      { key: "content", label: "Content", href: "/app/content" },
      { key: "brand", label: "Brand Brain", href: "/app/brand" },
    ],
  },
  {
    label: "Growth",
    items: [
      { key: "website", label: "Website & SEO", href: "/app/website" },
      { key: "ads", label: "Ads", href: "/app/ads" },
      { key: "crm", label: "CRM", href: "/app/crm" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "files", label: "Files", href: "/app/files" },
      { key: "reports", label: "Reports", href: "/app/reports" },
      { key: "integrations", label: "Integrations", href: "/app/integrations" },
      { key: "billing", label: "Billing", href: "/app/billing" },
      { key: "team", label: "Team", href: "/app/team" },
      { key: "settings", label: "Settings", href: "/app/settings" },
    ],
  },
];

export const APP_MOBILE_NAV_KEYS = ["home", "copilot", "missions", "approvals"];
