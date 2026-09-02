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
 *
 * Every item also declares `mode` ("normal" | "technical", default
 * "normal") — the master build brief's Normal Admin / Technical Admin
 * split (sections 15-18). This is an orthogonal axis from `release`:
 * maturity (Stable/Beta) vs audience (day-to-day agency ops vs engineering/
 * system tools). No new routes were invented to fill every named Technical
 * Admin slot in the brief (Agents/Skills/Jobs/Queues/Workers/APIs/
 * Deployments/Recovery have no dedicated real page yet) — each real
 * existing page is placed under whichever real slot it actually is; a
 * named slot with no real page is honestly absent rather than backed by an
 * empty placeholder page. See docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md
 * for the full mapping decision and what remains unmapped.
 */
export const ADMIN_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    label: "Home",
    items: [
      { key: "overview", label: "Home", href: "/admin", release: "v1", mode: "normal" },
      { key: "admin-copilot", label: "Admin Copilot", href: "/admin/copilot", release: "v1", mode: "normal" },
    ],
  },
  {
    label: "Clients",
    items: [{ key: "clients", label: "Clients", href: "/admin/clients", release: "v1", mode: "normal" }],
  },
  {
    label: "Growth",
    items: [{ key: "social", label: "Social Autopilot", href: "/admin/social", release: "v1", mode: "normal" }],
  },
  {
    label: "Sales",
    items: [
      { key: "leads", label: "Leads / CRM", href: "/admin/leads", release: "v1", mode: "normal" },
      { key: "go-free-codes", label: "Go Free Codes", href: "/admin/go-free-codes", release: "v1", mode: "normal" },
    ],
  },
  {
    label: "Finance",
    items: [{ key: "finance", label: "Finance", href: "/admin/finance", release: "v1", mode: "normal" }],
  },
  {
    label: "Tasks",
    items: [
      { key: "approvals", label: "Approvals", href: "/admin/approvals", release: "v1", mode: "normal" },
      { key: "handoffs", label: "Human Handoffs", href: "/admin/handoffs", release: "v1", mode: "normal" },
      { key: "audit-delivery", label: "Audit Delivery", href: "/admin/audit-requests", release: "v1", mode: "normal" },
    ],
  },
  {
    label: "Settings",
    items: [{ key: "team", label: "Team", href: "/admin/team", release: "v1", mode: "normal" }],
  },
  // --- Technical Admin (master build brief section 16) ------------------
  {
    label: "Brain",
    items: [
      { key: "operating-brain", label: "My Operating Brain", href: "/admin/operating-brain", release: "v2", mode: "technical" },
      { key: "capabilities", label: "Capability Registry", href: "/admin/capabilities", release: "v2", mode: "technical" },
    ],
  },
  {
    label: "Missions",
    items: [
      { key: "missions", label: "All Missions", href: "/admin/missions", release: "v1", mode: "technical" },
      { key: "hermes", label: "Hermes Mission Control", href: "/admin/hermes", release: "v2", mode: "technical" },
    ],
  },
  {
    label: "Connections",
    items: [{ key: "integrations", label: "Integrations", href: "/admin/integrations", release: "v1", mode: "technical" }],
  },
  {
    label: "Jobs & Queues",
    items: [
      // No dedicated Jobs/Queues/Workers page exists yet -- Operations Queue
      // is the closest real, live surface covering this territory. Not
      // renamed further to avoid overclaiming coverage it doesn't have.
      { key: "operations", label: "Operations Queue", href: "/admin/operations", release: "v1", mode: "technical" },
    ],
  },
  {
    label: "System",
    items: [
      { key: "system", label: "System Health", href: "/admin/system", release: "v1", mode: "technical" },
      { key: "audit", label: "Audit Log", href: "/admin/audit", release: "v1", mode: "technical" },
    ],
  },
];

// Mode-aware: getAdminMobileNav filters the already-mode-filtered nav data
// down to these keys, so each mode needs its own real quick-access list --
// a single shared list would silently produce an empty mobile bottom nav
// for whichever mode it doesn't cover (found live 2026-09-02, tracing
// through Update 41's own mode split: Technical mode's flattened nav never
// contains "overview"/"leads"/"approvals"/"clients", so the old single
// list resolved to zero items whenever viewMode was "technical").
export const ADMIN_MOBILE_NAV_KEYS: Record<"normal" | "technical", readonly string[]> = {
  normal: ["overview", "leads", "approvals", "clients"],
  technical: ["missions", "system", "integrations", "operating-brain"],
};
