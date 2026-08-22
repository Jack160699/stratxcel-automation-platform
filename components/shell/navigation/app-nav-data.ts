import type { NavGroupData } from "./nav-types";

/**
 * The client/workspace product's canonical information architecture — /app/*.
 * Used by tenant members running their own business.
 *
 * Finalized Canonical Customer Navigation:
 * Primary Dock: Home | Audit | Content | Growth | More
 *
 * Secondary Destinations (accessed via More sheet and contextual entry points):
 * Brand (also in header brand selector), Website, Connected Accounts, Billing, Staff, Settings.
 *
 * Growth Assistant is a dedicated full-screen conversational work mode (entered via
 * Home action cards, quick tools, and floating action), not a bottom dock item.
 */
export const APP_NAV_GROUPS_DATA: NavGroupData[] = [
  {
    // Primary destinations — 4 dock items on mobile + desktop sidebar primary group
    label: "Overview",
    items: [
      { key: "home", label: "Home", href: "/app", release: "v1", labelHi: "होम" },
      { key: "customer-audit", label: "Audit", href: "/app/audit", release: "v1", labelHi: "जाँच" },
      { key: "content", label: "Content", href: "/app/content", release: "v1", labelHi: "सामग्री" },
      { key: "growth", label: "Growth", href: "/app/growth", release: "v1", labelHi: "ग्रोथ" },
    ],
  },
  {
    // Secondary destinations — surfaced in the mobile "More" sheet and desktop sidebar secondary group
    label: "More",
    items: [
      { key: "brand", label: "Brand", href: "/app/brand", release: "v1", labelHi: "व्यापार" },
      { key: "website", label: "Website & Domain", href: "/app/website", release: "v1", labelHi: "वेबसाइट" },
      { key: "integrations", label: "Connected Accounts", href: "/app/integrations", release: "v1", labelHi: "कनेक्शन" },
      { key: "billing", label: "Plan & Billing", href: "/app/billing", release: "v1", labelHi: "भुगतान" },
      { key: "team", label: "Staff", href: "/app/team", release: "v1", labelHi: "टीम" },
      { key: "settings", label: "Settings", href: "/app/settings", release: "v1", labelHi: "सेटिंग्स" },
    ],
  },
];

/** Mobile primary dock: Home | Audit | Content | Growth — 5th slot is the More sheet trigger. */
export const APP_MOBILE_NAV_KEYS = ["home", "customer-audit", "content", "growth"];
