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
    items: [{ key: "clients", label: "Clients", href: "/admin/platform/tenants", icon: <PeopleIcon /> }],
  },
  {
    label: "Operations",
    items: [
      { key: "missions", label: "All Missions", href: "/admin/platform/missions", icon: <DocIcon /> },
      { key: "approvals", label: "Approvals", href: "/admin/platform/approvals", icon: <CheckIcon /> },
      { key: "queue", label: "Operations Queue", href: "/admin/platform/queue", icon: <QueueIcon /> },
    ],
  },
  {
    label: "Content",
    items: [
      { key: "social", label: "Social Autopilot", href: "/admin/social", icon: <MegaphoneIcon /> },
      { key: "inbox", label: "CRM / Contact Inbox", href: "/admin/inbox", icon: <InboxIcon /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "wallet", label: "Finance / Wallet", href: "/admin/platform/wallet", icon: <WalletIcon /> },
      { key: "integrations", label: "Integrations", href: "/admin/social/integrations", icon: <PlugIcon /> },
      { key: "system", label: "System Health", href: "/admin/social/system", icon: <PulseIcon /> },
    ],
  },
];

const MOBILE_NAV = [
  { key: "overview", label: "Home", href: "/admin", icon: <GridIcon /> },
  { key: "missions", label: "Missions", href: "/admin/platform/missions", icon: <DocIcon /> },
  { key: "approvals", label: "Approvals", href: "/admin/platform/approvals", icon: <CheckIcon /> },
  { key: "clients", label: "Clients", href: "/admin/platform/tenants", icon: <PeopleIcon /> },
];

function activeKeyFromPath(pathname: string): string {
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/platform/tenants")) return "clients";
  if (pathname.startsWith("/admin/platform/missions")) return "missions";
  if (pathname.startsWith("/admin/platform/approvals")) return "approvals";
  if (pathname.startsWith("/admin/platform/queue")) return "queue";
  if (pathname.startsWith("/admin/platform/wallet")) return "wallet";
  if (pathname.startsWith("/admin/social/integrations")) return "integrations";
  if (pathname.startsWith("/admin/social/system")) return "system";
  if (pathname.startsWith("/admin/social")) return "social";
  if (pathname.startsWith("/admin/inbox")) return "inbox";
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
