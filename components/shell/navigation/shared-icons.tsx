import type { ReactNode } from "react";

/**
 * One icon per nav concept, shared visually by /app and /admin even though
 * their destination lists are now separate (app-nav-data.ts / admin-nav-data.ts).
 * Keyed by nav item `key` so each shell's navigation file can look up the
 * right icon for whichever items it actually has.
 */
export const NAV_ICONS: Record<string, ReactNode> = {
  home: <GridIcon />,
  overview: <GridIcon />,
  copilot: <CopilotIcon />,
  missions: <DocIcon />,
  approvals: <CheckIcon />,
  content: <MegaphoneIcon />,
  brand: <SparkIcon />,
  website: <GlobeIcon />,
  search: <SearchIcon />,
  ads: <TargetIcon />,
  crm: <ChatIcon />,
  leads: <ChatIcon />,
  files: <FolderIcon />,
  reports: <ChartIcon />,
  integrations: <PlugIcon />,
  billing: <WalletIcon />,
  finance: <WalletIcon />,
  team: <PeopleIcon />,
  settings: <GearIcon />,
  clients: <PeopleIcon />,
  handoffs: <HandoffIcon />,
  operations: <QueueIcon />,
  system: <PulseIcon />,
  audit: <DocIcon />,
  social: <MegaphoneIcon />,
};

export function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}
export function CopilotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="2.4" />
      <circle cx="9" cy="9" r="6.2" />
    </svg>
  );
}
export function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.6" />
      <path d="M2.5 7h13" />
    </svg>
  );
}
export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 9l4 4 8-8" />
    </svg>
  );
}
export function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 4.5a1 1 0 011-1h9a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 3v-3H3.5a1 1 0 01-1-1v-6Z" />
    </svg>
  );
}
export function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M2.5 9h13M9 2.5c2 2 2 11 0 13M9 2.5c-2 2-2 11 0 13" />
    </svg>
  );
}
export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7.5" cy="7.5" r="4.5" />
      <path d="M11 11l4 4" />
    </svg>
  );
}
export function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6.5" />
      <circle cx="9" cy="9" r="3" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
    </svg>
  );
}
export function MegaphoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 8v2a1 1 0 001 1h1l2.5 3V4L5 7H4a1 1 0 00-1 1Z" />
      <path d="M10 6.5c1 .6 1 4.4 0 5" />
    </svg>
  );
}
export function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M9 2.5l1.4 4.1L14.5 8l-4.1 1.4L9 13.5l-1.4-4.1L3.5 8l4.1-1.4L9 2.5Z" />
    </svg>
  );
}
export function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 5.5a1 1 0 011-1h3l1.5 2h6a1 1 0 011 1v6.5a1 1 0 01-1 1h-10.5a1 1 0 01-1-1v-8.5Z" />
    </svg>
  );
}
export function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 14V8M7 14V4M11 14v-4M15 14V6" />
    </svg>
  );
}
export function PlugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 3v4M12 3v4M4.5 7h9v2a4.5 4.5 0 01-9 0V7Z" />
      <path d="M9 13.5v2" />
    </svg>
  );
}
export function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="5" width="13" height="9" rx="1.6" />
      <path d="M2.5 7.5h13" />
      <circle cx="12.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="13" cy="6" r="2.4" />
      <path d="M2.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4M9.5 15c0-2.5 1.8-4 3.5-4s3.5 1.5 3.5 4" />
    </svg>
  );
}
export function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="2.6" />
      <path d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2M4.5 4.5l1.4 1.4M12.1 12.1l1.4 1.4M13.5 4.5l-1.4 1.4M5.9 12.1L4.5 13.5" />
    </svg>
  );
}
export function HandoffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 6.5L8 3l5 3.5M3 6.5v6L8 15l5-3.5v-6M3 6.5L8 10l5-3.5" />
    </svg>
  );
}
export function QueueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 6h10M4 9h10M4 12h6" />
    </svg>
  );
}
export function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 9.5h3l1.5-4 2.5 8 1.5-4h4.5" />
    </svg>
  );
}
