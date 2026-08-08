import type { ReactNode } from "react";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/shell/Sidebar";
import { buildNavGroupsData, flattenNavItemsData, resolveActiveKey as resolveActiveKeyData, type ShellMode } from "./navigation-data";

/**
 * The one canonical navigation model shared by /app and /admin.
 *
 * Before this file, app/app/ClientAppShell.tsx and app/admin/(shell)/AppShell.tsx
 * each hand-wrote their own SidebarNavGroup[] array — same Sidebar/CoreAppShell
 * chrome underneath, but two independently-invented group labels, orderings,
 * and even icon shapes for the same concept (e.g. "CRM & Leads" vs "Leads").
 * That drift, not the shell component itself, is what made /app and /admin
 * feel like two different products. This file is the fix: one item list,
 * one icon per concept, one group structure. Each shell asks for its own
 * variant (`buildSidebarGroups("app" | "admin")`) and gets back only the
 * items that apply to it, in the same relative order.
 *
 * The actual group/href/label data and the active-route resolution logic
 * live in ./navigation-data.ts (plain TypeScript, no JSX) so that logic can
 * be imported and tested directly by a plain Node script — this file just
 * merges that data with icon components, which need a JSX transform neither
 * Node's --experimental-strip-types nor a test runner provides.
 *
 * Route preservation: every href in navigation-data.ts is copy-pasted from
 * the shell file it replaces — no route moved. /admin additionally gets an
 * "Admin" group of agency-only destinations (Clients, Human Handoffs,
 * Operations Queue, System Health, Audit Log) that has no /app equivalent —
 * appended, not replacing any of the shared groups above it, which is what
 * keeps the common part of the sidebar visually identical between the two
 * shells (see docs/product-design/SHARED_SHELL_SPECIFICATION.md §2).
 */

export type { ShellMode };
export { resolveActiveKeyData as resolveActiveKey };

const ICONS: Record<string, ReactNode> = {
  home: <GridIcon />,
  copilot: <CopilotIcon />,
  missions: <DocIcon />,
  approvals: <CheckIcon />,
  crm: <ChatIcon />,
  website: <GlobeIcon />,
  ads: <TargetIcon />,
  content: <MegaphoneIcon />,
  brand: <SparkIcon />,
  files: <FolderIcon />,
  reports: <ChartIcon />,
  integrations: <PlugIcon />,
  billing: <WalletIcon />,
  team: <PeopleIcon />,
  settings: <GearIcon />,
  clients: <PeopleIcon />,
  handoffs: <HandoffIcon />,
  operations: <QueueIcon />,
  system: <PulseIcon />,
  audit: <DocIcon />,
};

/** All groups a given shell should render, in the shared order, admin-only items appended last. */
export function buildSidebarGroups(mode: ShellMode): SidebarNavGroup[] {
  return buildNavGroupsData(mode).map((group) => ({
    label: group.label,
    items: group.items.map((item): SidebarNavItem => ({ ...item, icon: ICONS[item.key] ?? <DocIcon /> })),
  }));
}

/** Every item this shell renders, flattened — used both for the mobile "More" sheet grouping and by resolveActiveKey. */
export function flattenNavItems(mode: ShellMode): SidebarNavItem[] {
  return flattenNavItemsData(mode).map((item) => ({ ...item, icon: ICONS[item.key] ?? <DocIcon /> }));
}

// ---------------------------------------------------------------------------
// Icons — one shape per concept, shared by both shells (previously each shell
// defined its own copy, occasionally with different geometry for the same idea).
// ---------------------------------------------------------------------------

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
function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 4.5a1 1 0 011-1h9a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 3v-3H3.5a1 1 0 01-1-1v-6Z" />
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
function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="13" cy="6" r="2.4" />
      <path d="M2.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4M9.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4" />
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
function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 9.5h3l1.5-4 2.5 8 1.5-4h4.5" />
    </svg>
  );
}
