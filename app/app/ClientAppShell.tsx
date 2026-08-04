"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "./actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import type { SidebarNavGroup } from "@/components/shell/Sidebar";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";

/**
 * /app's shell — the exact same components/shell/CoreAppShell.tsx used by
 * /admin (app/admin/(shell)/AppShell.tsx), configured with the client-facing
 * nav from docs/product-design/CLIENT_APP_INFORMATION_ARCHITECTURE.md §1.
 * This is the literal "one product, not two shells" mechanism the brief
 * calls for — same component, different item array.
 */
const SIDEBAR_GROUPS: SidebarNavGroup[] = [
  {
    label: "Overview",
    items: [
      { key: "home", label: "Command Center", href: "/app", icon: <GridIcon /> },
      { key: "copilot", label: "Copilot", href: "/app/copilot", icon: <CopilotIcon /> },
    ],
  },
  {
    label: "Work",
    items: [
      { key: "missions", label: "Missions", href: "/app/missions", icon: <DocIcon /> },
      { key: "approvals", label: "Approvals", href: "/app/approvals", icon: <CheckIcon /> },
    ],
  },
  {
    label: "Content",
    items: [
      { key: "content", label: "Content", href: "/app/content", icon: <MegaphoneIcon /> },
      { key: "brand", label: "Brand Brain", href: "/app/brand", icon: <SparkIcon /> },
    ],
  },
  {
    label: "Growth",
    items: [
      { key: "website", label: "Website & SEO", href: "/app/website", icon: <GlobeIcon /> },
      { key: "ads", label: "Ads", href: "/app/ads", icon: <TargetIcon /> },
      { key: "crm", label: "CRM & Leads", href: "/app/crm", icon: <PeopleIcon /> },
    ],
  },
  {
    label: "Workspace",
    items: [
      { key: "files", label: "Files", href: "/app/files", icon: <FolderIcon /> },
      { key: "reports", label: "Reports", href: "/app/reports", icon: <ChartIcon /> },
      { key: "integrations", label: "Integrations", href: "/app/integrations", icon: <PlugIcon /> },
      { key: "billing", label: "Billing", href: "/app/billing", icon: <WalletIcon /> },
      { key: "team", label: "Team", href: "/app/team", icon: <PeopleIcon /> },
      { key: "settings", label: "Settings", href: "/app/settings", icon: <GearIcon /> },
    ],
  },
];

const MOBILE_NAV = [
  { key: "home", label: "Home", href: "/app", icon: <GridIcon /> },
  { key: "copilot", label: "Copilot", href: "/app/copilot", icon: <CopilotIcon /> },
  { key: "missions", label: "Missions", href: "/app/missions", icon: <DocIcon /> },
  { key: "approvals", label: "Approvals", href: "/app/approvals", icon: <CheckIcon /> },
];

function activeKeyFromPath(pathname: string): string {
  if (pathname === "/app") return "home";
  for (const group of SIDEBAR_GROUPS) {
    for (const item of group.items) {
      if (item.href !== "/app" && pathname.startsWith(item.href)) return item.key;
    }
  }
  return "home";
}

export function ClientAppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = activeKeyFromPath(pathname);

  return (
    <CoreAppShell
      product="App"
      sidebarGroups={SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={MOBILE_NAV}
      mobileMoreGroups={SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })),
      }))}
      topBarContext={<ClientTenantSwitcher />}
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
function CopilotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="2.4" />
      <circle cx="9" cy="9" r="6.2" />
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
function MegaphoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 8v2a1 1 0 001 1h1l2.5 3V4L5 7H4a1 1 0 00-1 1Z" />
      <path d="M10 6.5c1 .6 1 4.4 0 5" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M9 2.5l1.4 4.1L14.5 8l-4.1 1.4L9 13.5l-1.4-4.1L3.5 8l4.1-1.4L9 2.5Z" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M2.5 9h13M9 2.5c2 2 2 11 0 13M9 2.5c-2 2-2 11 0 13" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6.5" />
      <circle cx="9" cy="9" r="3" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
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
function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 5.5a1 1 0 011-1h3l1.5 2h6a1 1 0 011 1v6.5a1 1 0 01-1 1h-10.5a1 1 0 01-1-1v-8.5Z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 14V8M7 14V4M11 14v-4M15 14V6" />
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
function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="5" width="13" height="9" rx="1.6" />
      <path d="M2.5 7.5h13" />
      <circle cx="12.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="2.6" />
      <path d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2M4.5 4.5l1.4 1.4M12.1 12.1l1.4 1.4M13.5 4.5l-1.4 1.4M5.9 12.1L4.5 13.5" />
    </svg>
  );
}
