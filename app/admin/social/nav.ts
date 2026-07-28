export interface SocialNavItem {
  href: string;
  label: string;
  icon:
    | "home"
    | "copilot"
    | "create"
    | "planner"
    | "inbox"
    | "analytics"
    | "automations"
    | "brand"
    | "integrations"
    | "system"
    | "settings";
}

export const SOCIAL_NAV: SocialNavItem[] = [
  { href: "/admin/social", label: "Command Center", icon: "home" },
  { href: "/admin/social/copilot", label: "Copilot", icon: "copilot" },
  { href: "/admin/social/create", label: "Create", icon: "create" },
  { href: "/admin/social/planner", label: "Planner", icon: "planner" },
  { href: "/admin/social/inbox", label: "Inbox", icon: "inbox" },
  { href: "/admin/social/analytics", label: "Analytics", icon: "analytics" },
  { href: "/admin/social/automations", label: "Automations", icon: "automations" },
  { href: "/admin/social/brand", label: "Brand Brain", icon: "brand" },
  { href: "/admin/social/integrations", label: "Integrations", icon: "integrations" },
  { href: "/admin/social/system", label: "System", icon: "system" },
];

export const SOCIAL_UTILITY_NAV: SocialNavItem[] = [
  { href: "/admin/social/settings", label: "Settings", icon: "settings" },
];
