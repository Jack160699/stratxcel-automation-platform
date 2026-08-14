import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT_EMAIL } from "@/lib/constants";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

const COLUMNS = [
  {
    title: "AI Agents",
    links: [
      { label: "AI Business Agent", href: "/ai-business-agent" },
      { label: "AI Workforce", href: "/ai-workforce" },
      { label: "AI SEO Agent", href: "/ai-seo-agent" },
      { label: "AI Website Agent", href: "/ai-website-agent" },
      { label: "AI Social Media Agent", href: "/ai-social-media-agent" },
      { label: "AI CRM Agent", href: "/ai-crm-agent" },
      { label: "AI Marketing Agent", href: "/ai-marketing-agent" },
      { label: "AI Automation", href: "/ai-business-automation" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "All products", href: "/products" },
      { label: "Social Autopilot", href: "/social-autopilot" },
      { label: "Integrations", href: "/integrations" },
      { label: "Pricing & Plans", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "All solutions", href: "/solutions" },
      { label: "Lead generation", href: "/solutions#more-leads" },
      { label: "Content consistency", href: "/solutions#grow-social" },
      { label: "WhatsApp follow-up", href: "/solutions#automate-whatsapp" },
      { label: "Website & discovery", href: "/solutions#improve-website" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Resources hub", href: "/resources" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Security", href: "/security" },
      { label: "Business Growth Audit", href: "/audit" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact sales", href: "/contact" },
      { label: "Book a demo", href: "/contact?intent=demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Data Deletion", href: "/data-deletion" },
    ],
  },
];

const OFFICIAL_SOCIALS = [
  { platform: "instagram" as const, label: "Instagram", url: "https://www.instagram.com/stratxcel" },
  { platform: "facebook" as const, label: "Facebook", url: "https://www.facebook.com/stratxcel" },
  { platform: "threads" as const, label: "Threads", url: "https://www.threads.net/@stratxcel" },
  { platform: "youtube" as const, label: "YouTube", url: "https://www.youtube.com/@stratxcel" },
  { platform: "whatsapp" as const, label: "WhatsApp", url: "https://wa.me/917777812777" },
  { platform: "website" as const, label: "LinkedIn", url: "https://www.linkedin.com/company/stratxcel" },
];

export function PublicFooter({ logoVariant = "dark" }: { logoVariant?: "light" | "dark" }) {
  return (
    <footer className="border-t border-sx-border bg-sx-bg text-sx-text">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          <div className="sm:col-span-2 md:col-span-4 lg:col-span-1">
            <Logo variant={logoVariant} />
            <p className="mt-3 text-xs text-sx-text-muted">
              Stratxcel runs growth operations that turn attention into opportunities.
            </p>
            <p className="mt-3 font-sx-mono text-[11px] font-semibold text-sx-accent">https://www.stratxcel.in</p>

            {/* Official Social Channels */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {OFFICIAL_SOCIALS.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-7 w-7 items-center justify-center rounded-sx-sm bg-sx-surface-2 text-sx-text-muted transition-colors hover:bg-sx-surface-3 hover:text-sx-text"
                >
                  <PlatformIcon name={s.platform} />
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-accent">{col.title}</p>
              <ul className="mt-3.5 space-y-2 text-xs">
                {col.links.map((item) => (
                  <li key={item.href + item.label}>
                    <Link href={item.href} className="font-medium text-sx-text-muted hover:text-sx-text">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-sx-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-sx-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stratxcel Technologies. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="https://wa.me/917777812777" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-sx-text">
              WhatsApp: +91 77778 12777
            </a>
            <span>·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium hover:text-sx-text">
              Contact: {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
