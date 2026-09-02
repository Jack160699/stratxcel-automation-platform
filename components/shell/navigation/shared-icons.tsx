import type { ReactNode } from "react";
import {
  LayoutGrid,
  Bot,
  FileText,
  Check,
  MessageSquare,
  Globe,
  Search,
  Target,
  Megaphone,
  Sparkles,
  Folder,
  BarChart3,
  Plug,
  Wallet,
  Users,
  Settings,
  Handshake,
  ListOrdered,
  Activity,
} from "lucide-react";

/**
 * One icon per nav concept, shared visually by /app and /admin even though
 * their destination lists are now separate (app-nav-data.ts / admin-nav-data.ts).
 * Keyed by nav item `key` so each shell's navigation file can look up the
 * right icon for whichever items it actually has.
 *
 * Master build brief sections 19-20 ("prefer appropriate use of... Lucide"):
 * this file used to hand-draw all 18 icons as raw inline <svg> at 16x16.
 * Replaced with real lucide-react icons (a real, maintained, widely-used
 * open-source icon set), same 16px size and 1.4 stroke width preserved so
 * every existing call site (NAV_ICONS[key]) needs zero changes.
 */
const ICON_SIZE = 16;
const ICON_STROKE = 1.4;

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
  "customer-audit": <DocIcon />,
  social: <MegaphoneIcon />,
  "admin-copilot": <CopilotIcon />,
  "operating-brain": <SparkIcon />,
  hermes: <PulseIcon />,
  capabilities: <DocIcon />,
};

export function GridIcon() {
  return <LayoutGrid size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function CopilotIcon() {
  return <Bot size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function DocIcon() {
  return <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function CheckIcon() {
  return <Check size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function ChatIcon() {
  return <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function GlobeIcon() {
  return <Globe size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function SearchIcon() {
  return <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function TargetIcon() {
  return <Target size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function MegaphoneIcon() {
  return <Megaphone size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function SparkIcon() {
  return <Sparkles size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function FolderIcon() {
  return <Folder size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function ChartIcon() {
  return <BarChart3 size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function PlugIcon() {
  return <Plug size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function WalletIcon() {
  return <Wallet size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function PeopleIcon() {
  return <Users size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function GearIcon() {
  return <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function HandoffIcon() {
  return <Handshake size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function QueueIcon() {
  return <ListOrdered size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
export function PulseIcon() {
  return <Activity size={ICON_SIZE} strokeWidth={ICON_STROKE} />;
}
