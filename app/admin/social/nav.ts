export interface SocialNavItem {
  href: string;
  label: string;
}

export const SOCIAL_NAV: SocialNavItem[] = [
  { href: "/admin/social", label: "Command Center" },
  { href: "/admin/social/create", label: "Create" },
  { href: "/admin/social/planner", label: "Planner" },
  { href: "/admin/social/inbox", label: "Inbox" },
  { href: "/admin/social/analytics", label: "Analytics" },
  { href: "/admin/social/automations", label: "Automations" },
  { href: "/admin/social/brand", label: "Brand Brain" },
  { href: "/admin/social/integrations", label: "Integrations" },
  { href: "/admin/social/system", label: "System" },
];

export const SOCIAL_UTILITY_NAV: SocialNavItem[] = [
  { href: "/admin/social/settings", label: "Settings" },
];
