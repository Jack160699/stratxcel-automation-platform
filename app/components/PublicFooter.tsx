import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Interactive Product Tour", href: "/experience" },
      { label: "Modules & Workspace", href: "/modules" },
      { label: "Social Autopilot", href: "/social-autopilot" },
      { label: "AI Copilot Engine", href: "/app/copilot" },
      { label: "Missions & Approvals", href: "/app/approvals" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Lead Generation", href: "/use-cases" },
      { label: "Content Consistency", href: "/use-cases" },
      { label: "WhatsApp Automation", href: "/use-cases" },
      { label: "Website Workspace", href: "/use-cases" },
      { label: "Campaign Workflows", href: "/use-cases" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "AI Business Audit", href: "/audit" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing & Plans", href: "/pricing" },
      { label: "Security Architecture", href: "/security" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "Company & Legal",
    links: [
      { label: "About Stratxcel", href: "/about" },
      { label: "Contact Support", href: "/contact" },
      { label: "Customer Support", href: "/support" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refunds & Cancellation", href: "/refund-cancellation" },
      { label: "Data Deletion", href: "/data-deletion" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Domain & Website Terms", href: "/domain-website-terms" },
      { label: "Third-Party Providers", href: "/third-party-providers" },
      { label: "Data Processing Terms", href: "/data-processing-terms" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-sx-border bg-sx-bg text-sx-text">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Logo variant="dark" />
            <p className="mt-3 font-sx-sans text-xs leading-relaxed text-sx-text-muted">
              One AI-powered operating system for growth, content, WhatsApp lead follow-up, and website operations.
            </p>
            <p className="mt-3 font-sx-mono text-[11px] font-semibold text-sx-accent">
              https://www.stratxcel.in
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-sx-mono text-[10px] uppercase tracking-[0.14em] font-bold text-sx-accent">{col.title}</p>
              <ul className="mt-3.5 space-y-2 text-xs">
                {col.links.map((item) => (
                  <li key={item.href + item.label}>
                    <Link href={item.href} className="font-sx-sans text-sx-text-muted transition-colors hover:text-sx-text font-medium">
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
        <div className="mx-auto flex max-w-7xl flex-col gap-2 font-sx-sans text-xs text-sx-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stratxcel Technologies. All rights reserved.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-sx-text font-medium">
            Contact: {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
