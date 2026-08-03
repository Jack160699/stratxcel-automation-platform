"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import type { SidebarNavGroup } from "@/components/shell/Sidebar";
import { ClientSwitcher } from "./ClientSwitcher";

/**
 * Re-skinned onto the shared Stratxcel Core shell (components/shell/CoreAppShell.tsx)
 * — same nav destinations as before, regrouped to match
 * docs/product-design/ADMIN_INFORMATION_ARCHITECTURE.md §1. Route paths are
 * intentionally unchanged in this pass (no renames/redirects yet — see the
 * migration report) so nothing here can break a bookmark.
 */
const SIDEBAR_GROUPS: SidebarNavGroup[] = [
  { items: [{ key: "overview", label: "Agency Overview", href: "/admin", icon: <GridIcon /> }] },
  {
    label: "Clients",
    items: [
      { key: "clients", label: "Clients", href: "/admin/clients", icon: <PeopleIcon /> },
      { key: "leads", label: "Leads", href: "/admin/leads", icon: <InboxIcon /> },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "missions", label: "All Missions", href: "/admin/missions", icon: <DocIcon /> },
      { key: "approvals", label: "Approvals", href: "/admin/approvals", icon: <CheckIcon /> },
      { key: "handoffs", label: "Human Handoffs", href: "/admin/handoffs", icon: <HandoffIcon /> },
      { key: "operations", label: "Operations Queue", href: "/admin/operations", icon: <QueueIcon /> },
    ],
  },
  {
    label: "Content",
    items: [{ key: "social", label: "Social Autopilot", href: "/admin/social", icon: <MegaphoneIcon /> }],
  },
  {
    label: "Platform",
    items: [
      { key: "finance", label: "Finance", href: "/admin/finance", icon: <WalletIcon /> },
      { key: "team", label: "Team", href: "/admin/team", icon: <PeopleIcon /> },
      { key: "integrations", label: "Integrations", href: "/admin/integrations", icon: <PlugIcon /> },
      { key: "system", label: "System Health", href: "/admin/system", icon: <PulseIcon /> },
      { key: "audit", label: "Audit Log", href: "/admin/audit", icon: <DocIcon /> },
    ],
  },
];

const MOBILE_NAV = [
  { key: "overview", label: "Home", href: "/admin", icon: <GridIcon /> },
  { key: "missions", label: "Missions", href: "/admin/missions", icon: <DocIcon /> },
  { key: "approvals", label: "Approvals", href: "/admin/approvals", icon: <CheckIcon /> },
  { key: "clients", label: "Clients", href: "/admin/clients", icon: <PeopleIcon /> },
];

function activeKeyFromPath(pathname: string): string {
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/leads")) return "leads";
  if (pathname.startsWith("/admin/missions")) return "missions";
  if (pathname.startsWith("/admin/approvals")) return "approvals";
  if (pathname.startsWith("/admin/handoffs")) return "handoffs";
  if (pathname.startsWith("/admin/operations")) return "operations";
  if (pathname.startsWith("/admin/finance")) return "finance";
  if (pathname.startsWith("/admin/team")) return "team";
  if (pathname.startsWith("/admin/integrations")) return "integrations";
  if (pathname.startsWith("/admin/system")) return "system";
  if (pathname.startsWith("/admin/audit")) return "audit";
  if (pathname.startsWith("/admin/social")) return "social";
  return "overview";
}

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = activeKeyFromPath(pathname);

  return (
    <CoreAppShell
      product="Admin"
      sidebarGroups={SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={MOBILE_NAV}
      mobileMoreGroups={SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })),
      }))}
      topBarContext={<ClientSwitcher />}
      userMenu={
        <div className="flex items-center gap-2.5">
          <span className="hidden truncate text-xs text-sx-text-subtle sm:inline">{email}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-9 rounded-sx-sm border border-sx-border-strong px-2.5 text-xs font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
            >
              Sign out
            </button>
          </form>
        </div>
      }
    >
      {children}
    </CoreAppShell>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="13" cy="6" r="2.4" />
      <path d="M2.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4M9.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.6" />
      <path d="M2.5 7h13" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 9l4 4 8-8" />
    </svg>
  );
}
function HandoffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 6.5L8 3l5 3.5M3 6.5v6L8 15l5-3.5v-6M3 6.5L8 10l5-3.5" />
    </svg>
  );
}
function QueueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 6h10M4 9h10M4 12h6" />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 8v2a1 1 0 001 1h1l2.5 3V4L5 7H4a1 1 0 00-1 1Z" />
      <path d="M10 6.5c1 .6 1 4.4 0 5" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 9h4l1.2 2h2.6l1.2-2h4" />
      <rect x="2.5" y="4" width="13" height="10" rx="1.6" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="5" width="13" height="9" rx="1.6" />
      <path d="M2.5 7.5h13" />
      <circle cx="12.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PlugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 3v4M12 3v4M4.5 7h9v2a4.5 4.5 0 01-9 0V7Z" />
      <path d="M9 13.5v2" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 9.5h3l1.5-4 2.5 8 1.5-4h4.5" />
    </svg>
  );
}
