import type { NavGroupData } from "./nav-types";

/**
 * Stratxcel staff/agency admin's own information architecture — /admin/*.
 * Used by Stratxcel's internal team managing every client. Deliberately
 * NOT derived from (or shared with) APP_NAV_GROUPS_DATA in ./app-nav-data.ts
 * — see that file's header comment. /admin gets agency-wide operational
 * destinations (Clients, Human Handoffs, Operations Queue, System Health,
 * Audit Log) that have no client-facing equivalent, and deliberately omits
 * client-only modules (Website & SEO, Ads, Brand Brain, Files, Billing,
 * Settings) that exist in /app but are not agency operations. If staff need
 * a specific client's own workspace, that goes through an explicit "View
 * client workspace" action (docs/product-design/ROLE_AND_PERMISSION_EXPERIENCE.md §6),
 * not by adding client-facing routes into this list.
 */
export const ADMIN_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    label: "Overview",
    items: [
      { key: "overview", label: "Agency Overview", href: "/admin" },
      { key: "admin-copilot", label: "Admin Copilot", href: "/admin/copilot" },
      { key: "operating-brain", label: "My Operating Brain", href: "/admin/operating-brain" },
    ],
  },
  {
    label: "Clients",
    items: [
      { key: "clients", label: "Clients", href: "/admin/clients" },
      { key: "leads", label: "Leads / CRM", href: "/admin/leads" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "missions", label: "All Missions", href: "/admin/missions" },
      { key: "approvals", label: "Approvals", href: "/admin/approvals" },
      { key: "handoffs", label: "Human Handoffs", href: "/admin/handoffs" },
      { key: "operations", label: "Operations Queue", href: "/admin/operations" },
    ],
  },
  {
    label: "Content",
    items: [{ key: "social", label: "Social Autopilot", href: "/admin/social" }],
  },
  {
    label: "Platform",
    items: [
      { key: "finance", label: "Finance", href: "/admin/finance" },
      { key: "team", label: "Team", href: "/admin/team" },
      { key: "integrations", label: "Integrations", href: "/admin/integrations" },
      { key: "system", label: "System Health", href: "/admin/system" },
      { key: "audit", label: "Audit Log", href: "/admin/audit" },
    ],
  },
];

export const ADMIN_MOBILE_NAV_KEYS = ["overview", "missions", "approvals", "clients"];
