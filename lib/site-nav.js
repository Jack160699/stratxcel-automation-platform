/** Primary navigation and footer IA — AI Operating System framing. */

import { CONTACT_EMAIL, STRATXCEL_APP_URL, whatsappHref } from "./constants";

export const mainNav = [
  { label: "System", href: "/system" },
  { label: "Modules", href: "/modules" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Agents", href: "/agents" },
  { label: "Pricing", href: "/pricing" },
];

export const footerColumns = [
  {
    title: "System",
    links: [
      { label: "AI OS overview", href: "/system" },
      { label: "Architecture", href: "/system#architecture" },
    ],
  },
  {
    title: "Modules",
    links: [
      { label: "Module map", href: "/modules" },
      { label: "Lead intelligence", href: "/modules#lead" },
      { label: "Workflow engine", href: "/modules#workflow" },
      { label: "Automation fabric", href: "/modules#automation" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Founders", href: "/use-cases#founders" },
      { label: "Agencies", href: "/use-cases#agencies" },
      { label: "Local businesses", href: "/use-cases#local" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: `mailto:${CONTACT_EMAIL}`, external: true },
      { label: "WhatsApp", href: whatsappHref, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Agents", href: "/agents" },
      { label: "Stratxcel AI", href: STRATXCEL_APP_URL, external: true },
    ],
  },
];
