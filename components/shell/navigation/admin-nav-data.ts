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
 *
 * V2 / experimental surfaces declare release: "v2" and are only revealed
 * when an authorized owner-admin has Beta Mode ON (server cookie).
 */
export const ADMIN_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    label: "Overview",
    items: [
      { key: "overview", label: "Agency Overview", href: "/admin", release: "v1" },
      { key: "admin-copilot", label: "Admin Copilot", href: "/admin/copilot", release: "v1" },
    ],
  },
  {
    label: "Clients",
    items: [
      { key: "clients", label: "Clients", href: "/admin/clients", release: "v1" },
      { key: "leads", label: "Leads / CRM", href: "/admin/leads", release: "v1" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "missions", label: "All Missions", href: "/admin/missions", release: "v1" },
      { key: "approvals", label: "Approvals", href: "/admin/approvals", release: "v1" },
      { key: "handoffs", label: "Human Handoffs", href: "/admin/handoffs", release: "v1" },
      { key: "operations", label: "Operations Queue", href: "/admin/operations", release: "v1" },
      { key: "audit-delivery", label: "Audit Delivery", href: "/admin/audit-requests", release: "v1" },
    ],
  },
  {
    label: "Growth",
    items: [{ key: "social", label: "Social Autopilot", href: "/admin/social", release: "v1" }],
  },
  {
    label: "Platform",
    items: [
      { key: "finance", label: "Finance", href: "/admin/finance", release: "v1" },
      { key: "go-free-codes", label: "Go Free Codes", href: "/admin/go-free-codes", release: "v1" },
      { key: "team", label: "Team", href: "/admin/team", release: "v1" },
      { key: "integrations", label: "Integrations", href: "/admin/integrations", release: "v1" },
      { key: "system", label: "System Health", href: "/admin/system", release: "v1" },
      { key: "audit", label: "Audit Log", href: "/admin/audit", release: "v1" },
    ],
  },
  {
    label: "Beta",
    items: [
      { key: "operating-brain", label: "My Operating Brain", href: "/admin/operating-brain", release: "v2" },
      { key: "hermes", label: "Hermes Mission Control", href: "/admin/hermes", release: "v2" },
    ],
  },
];

export const ADMIN_MOBILE_NAV_KEYS = ["overview", "missions", "approvals", "clients"];
