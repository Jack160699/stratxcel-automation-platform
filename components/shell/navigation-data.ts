/**
 * Pure nav-model data + logic — no JSX, no React import. Deliberately
 * separated from components/shell/navigation.tsx (which attaches icons)
 * so this file can be imported directly by plain Node test scripts
 * (`node --experimental-strip-types`, which strips TypeScript types but
 * does NOT transform JSX — a .tsx file with real JSX icon literals can't be
 * imported that way). navigation.tsx merges these definitions with icon
 * components and is what the shells actually import.
 */

export type ShellMode = "app" | "admin";

export interface NavItemData {
  key: string;
  label: string;
  href: string;
}

export interface NavGroupData {
  label?: string;
  items: NavItemData[];
}

export interface NavItemSpecData {
  key: string;
  label: string;
  appHref?: string;
  adminHref?: string;
  adminLabel?: string;
}

interface NavGroupSpecData {
  label?: string;
  items: NavItemSpecData[];
}

export const CORE_NAV_GROUPS_DATA: NavGroupSpecData[] = [
  {
    label: "Overview",
    items: [
      { key: "home", label: "Command Center", appHref: "/app", adminHref: "/admin" },
      { key: "copilot", label: "Copilot", appHref: "/app/copilot" },
    ],
  },
  {
    label: "Work",
    items: [
      { key: "missions", label: "Missions", adminLabel: "All Missions", appHref: "/app/missions", adminHref: "/admin/missions" },
      { key: "approvals", label: "Approvals", appHref: "/app/approvals", adminHref: "/admin/approvals" },
    ],
  },
  {
    label: "Growth",
    items: [
      { key: "crm", label: "CRM", appHref: "/app/crm", adminHref: "/admin/leads" },
      { key: "website", label: "Website & SEO", appHref: "/app/website" },
      { key: "ads", label: "Ads", appHref: "/app/ads" },
      { key: "content", label: "Content", adminLabel: "Social Autopilot", appHref: "/app/content", adminHref: "/admin/social" },
      { key: "brand", label: "Brand Brain", appHref: "/app/brand" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "files", label: "Files", appHref: "/app/files" },
      { key: "reports", label: "Reports", appHref: "/app/reports" },
      { key: "integrations", label: "Integrations", appHref: "/app/integrations", adminHref: "/admin/integrations" },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "billing", label: "Billing", adminLabel: "Finance", appHref: "/app/billing", adminHref: "/admin/finance" },
      { key: "team", label: "Team", appHref: "/app/team", adminHref: "/admin/team" },
      { key: "settings", label: "Settings", appHref: "/app/settings" },
    ],
  },
];

export const ADMIN_ONLY_GROUP_DATA: NavGroupSpecData = {
  label: "Admin",
  items: [
    { key: "clients", label: "Clients", adminHref: "/admin/clients" },
    { key: "handoffs", label: "Human Handoffs", adminHref: "/admin/handoffs" },
    { key: "operations", label: "Operations Queue", adminHref: "/admin/operations" },
    { key: "system", label: "System Health", adminHref: "/admin/system" },
    { key: "audit", label: "Audit Log", adminHref: "/admin/audit" },
  ],
};

function itemFor(mode: ShellMode, spec: NavItemSpecData): NavItemData | null {
  const href = mode === "app" ? spec.appHref : spec.adminHref;
  if (!href) return null;
  const label = mode === "admin" && spec.adminLabel ? spec.adminLabel : spec.label;
  return { key: spec.key, label, href };
}

export function buildNavGroupsData(mode: ShellMode): NavGroupData[] {
  const groups: NavGroupData[] = [];
  for (const group of CORE_NAV_GROUPS_DATA) {
    const items = group.items.map((spec) => itemFor(mode, spec)).filter((i): i is NavItemData => i !== null);
    if (items.length > 0) groups.push({ label: group.label, items });
  }
  if (mode === "admin") {
    const items = ADMIN_ONLY_GROUP_DATA.items.map((spec) => itemFor(mode, spec)).filter((i): i is NavItemData => i !== null);
    if (items.length > 0) groups.push({ label: ADMIN_ONLY_GROUP_DATA.label, items });
  }
  return groups;
}

export function flattenNavItemsData(mode: ShellMode): NavItemData[] {
  return buildNavGroupsData(mode).flatMap((g) => g.items);
}

/** Longest-prefix match so `/admin/leads` doesn't resolve to `home` just because `/admin` is also a valid prefix of it. */
export function resolveActiveKey(pathname: string, mode: ShellMode): string {
  const items = flattenNavItemsData(mode);
  let best: NavItemData | null = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.key ?? items[0]?.key ?? "home";
}
